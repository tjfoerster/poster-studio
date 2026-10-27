// Completes a built poster in a live document (the preview iframe): draws the diagrams, sets the print size,
// and reports what does not fit. Needs a DOM, so it is a separate entry point (@poster-studio/engine/finish).
import { render, type TextMeasurer } from 'pele'
import type { Diagnostic } from './types.ts'

/** diagnostics, and the size of the page in CSS pixels (for fitting the preview to the window). */
export type Finished = { diagnostics: Diagnostic[]; width: number; height: number }

const mm = (px: number) => Math.round((px * 25.4) / 96)

export async function finish(document: Document): Promise<Finished> {
  const window = document.defaultView!
  const diagnostics: Diagnostic[] = []
  await document.fonts.ready

  document.querySelectorAll<HTMLElement>('.diagram[data-source]').forEach((element, i) => {
    try {
      drawDiagram(element, `diagram-${i}-`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      element.textContent = `Diagram: ${message}`
      element.classList.add('error')
      diagnostics.push({ severity: 'error', message: `Diagram: ${message}`, file: fileOf(element), line: Number(element.dataset.line) || undefined })
    }
  })

  // The paper size for printing comes from --width and --height in the template (or the poster's settings)
  const root = window.getComputedStyle(document.documentElement)
  const size = `${root.getPropertyValue('--width').trim()} ${root.getPropertyValue('--height').trim()}`
  document.getElementById('poster-page')?.remove()
  const page = Object.assign(document.createElement('style'), { id: 'poster-page', textContent: `@page { size: ${size}; margin: 0 }` })
  document.head.append(page)

  diagnostics.push(...overflow(document))
  const poster = document.querySelector<HTMLElement>('.poster') ?? document.documentElement
  return { diagnostics, width: poster.offsetWidth, height: poster.offsetHeight }
}

/** A diagram or chart in Mermaid syntax, drawn by Pele at the text size of its box; charts use the full width. */
function drawDiagram(element: HTMLElement, idPrefix: string) {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element)
  const fontSize = parseFloat(style.fontSize)
  const width = element.clientWidth
  // Charts default to 700px; use the full column, but no taller than about 12 lines of text.
  const config = { xyChart: { width, height: Math.round(Math.min(width * 0.7, fontSize * 12)) } }
  const fontFamily = style.getPropertyValue('--pele-font').trim() || style.fontFamily
  const fontFamilyMono = style.getPropertyValue('--pele-font-mono').trim() || 'monospace'
  const options = { fontSize, config, fontFamily, fontFamilyMono, idPrefix, measurer: measurer(element.ownerDocument, fontFamily, fontFamilyMono) }
  let result = render(element.dataset.source!, options)
  if (width > 0 && width < result.width) result = render(element.dataset.source!, { ...options, maxWidth: width })
  element.innerHTML = result.svg
}

/** Measures text with a canvas of the poster's own document, so the template's fonts are used (as Pele's measurer does otherwise). */
function measurer(document: Document, family: string, mono: string): TextMeasurer {
  const context = document.createElement('canvas').getContext('2d')!
  const widths = new Map<string, number>()
  return {
    width(text, size, style) {
      // style: 1 bold, 2 italic, 4 monospace, 8 subscript, 16 superscript (smaller by 1.2, as in Pele)
      const font = `${style & 2 ? 'italic ' : ''}${style & 1 ? 'bold ' : ''}${style & 24 ? size / 1.2 : size}px ${style & 4 ? mono : family}`
      const key = `${font}\n${text}`
      let width = widths.get(key)
      if (width === undefined) {
        context.font = font
        widths.set(key, (width = context.measureText(text).width))
      }
      return width
    },
  }
}

/**
 * How far the given elements reach beyond the content box of container (its outer edge with edge: 'border'), in CSS pixels;
 * 0 if they fit. Measured on the elements' boxes, one per column fragment, rather than with scrollHeight: that also counts
 * how far the letters of the last line stick out of their line (fonts like Jost are taller than a line height of 1.35).
 */
function beyond(container: HTMLElement, elements: Iterable<Element>, edge: 'content' | 'border' = 'content') {
  const style = container.ownerDocument.defaultView!.getComputedStyle(container)
  const inset = (side: 'Bottom' | 'Right') => (edge === 'border' ? 0 : parseFloat(style[`border${side}Width`]) + parseFloat(style[`padding${side}`]))
  const box = container.getBoundingClientRect()
  const bottom = box.bottom - inset('Bottom')
  const right = box.right - inset('Right')
  let extra = 0
  for (const element of elements) for (const rect of element.getClientRects()) extra = Math.max(extra, rect.bottom - bottom, rect.right - right)
  return extra > 1 ? extra : 0
}

/** Boxes whose content does not fit, boxes that reach beyond the space for the grid, anything beyond the page. */
function overflow(document: Document): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const areas = [...document.querySelectorAll<HTMLElement>('[data-poster-grid] > .area')]
  for (const area of areas) area.removeAttribute('data-overflow')
  const mark = (area: HTMLElement) => area.setAttribute('data-overflow', '')

  for (const area of areas) {
    const extra = beyond(area, area.children)
    if (extra) {
      mark(area)
      diagnostics.push({ severity: 'error', message: `Does not fit into its box (${mm(extra)} mm too much)`, file: area.dataset.file })
    }
  }

  const grid = document.querySelector<HTMLElement>('[data-poster-grid]')
  const tooTall = grid ? beyond(grid, areas) : 0
  if (grid && tooTall) {
    const bottom = grid.getBoundingClientRect().bottom
    areas.filter((area) => area.getBoundingClientRect().bottom > bottom + 1).forEach(mark)
    const message = `The boxes are ${mm(tooTall)} mm taller than the space for them: shorten the marked boxes, make pictures smaller or change the layout`
    diagnostics.push({ severity: 'error', message, file: 'poster.yaml' })
  }

  // Anything else beyond the page (boxes that are too tall have been reported above)
  const poster = document.querySelector<HTMLElement>('.poster')
  if (poster) {
    const others = [...poster.querySelectorAll('*')].filter((element) => !tooTall || !grid!.contains(element))
    const extra = beyond(poster, others, 'border')
    if (extra) diagnostics.push({ severity: 'error', message: `Something reaches ${mm(extra)} mm beyond the page and would be cut off when printing` })
  }
  return diagnostics
}

const fileOf = (element: HTMLElement) => element.closest<HTMLElement>('[data-file]')?.dataset.file
