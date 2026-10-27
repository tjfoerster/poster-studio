// Puts the rendered parts into the template: <slot name="header|sections|references|footer"> are replaced, the parent of
// the sections slot becomes the grid. The engine adds its own CSS (grid, print), the poster's setting overrides and a Content
// Security Policy that keeps the page self-contained: no scripts run, nothing is loaded from the network.
import type { Element, ElementContent, Root, RootContent } from 'hast'
import { fromHtml } from 'hast-util-from-html'
import { toHtml } from 'hast-util-to-html'
import { SKIP, visit } from 'unist-util-visit'
import type { Manifest } from './manifest.ts'
import type { Diagnostic } from './types.ts'

type Parts = { header?: ElementContent[]; footer?: ElementContent[]; areas: Element[]; references?: Element; layoutCss: string }

const policy = "default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; media-src data: blob:"

/** Engine-owned CSS. :where() keeps the defaults overridable by the template; grid placement and the preview rules are not. */
const engineCss = `
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:where([data-poster-grid]) { gap: var(--gap, 10mm); min-height: 0; }
:where([data-poster-grid] > .area) { min-width: 0; column-gap: var(--gap, 10mm); }
:where(.area hr) { break-after: column; height: 0; margin: 0; border: 0; }
:where(.area .wide, .area > h2:first-child) { column-span: all; }
:where(.area figure, .area .diagram, .area blockquote) { break-inside: avoid; }
@media screen {
  .poster { overflow: visible !important; }
  [data-overflow] { outline: 1.5mm dashed #d03b3b; outline-offset: 1mm; }
  [data-file][data-hover] { outline: 1.5mm solid rgb(37 99 235 / 0.45); outline-offset: 1mm; }
}`

export function fillTemplate(source: string, path: string, manifest: Manifest, parts: Parts): { html: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const tree = fromHtml(source)
  const styles: string[] = []
  const slots = new Map<string, { node: Element; parent: Element | Root }>()
  let page = false

  visit(tree, (node, index, parent) => {
    if (node.type !== 'element' || !parent || index === undefined) return
    if (node.tagName === 'script' || node.tagName === 'base' || (node.tagName === 'link' && String(node.properties.rel).includes('stylesheet'))) {
      if (node.tagName === 'link') diagnostics.push({ severity: 'warning', message: 'The template loads a stylesheet from another file; put all CSS into its <style> element', file: path })
      parent.children.splice(index, 1)
      return [SKIP, index]
    }
    for (const property of Object.keys(node.properties)) if (/^on[A-Z]/.test(property)) delete node.properties[property]
    if (node.tagName === 'style') styles.push(node.children.map((child) => (child.type === 'text' ? child.value : '')).join(''))
    if (node.tagName === 'slot') slots.set(String(node.properties.name ?? ''), { node, parent: parent as Element | Root })
    if (Array.isArray(node.properties.className) && node.properties.className.includes('poster')) page = true
  })

  const fill = (name: string, children: ElementContent[]) => {
    const slot = slots.get(name)
    if (slot) slot.parent.children.splice(slot.parent.children.indexOf(slot.node), 1, ...(children as RootContent[]))
    return slot
  }
  // The element around a slot names the file its content comes from (the editor opens it on a click into the preview)
  for (const [name, children] of [['header', parts.header], ['footer', parts.footer]] as const) {
    const slot = fill(name, children ?? [])
    if (slot && children && slot.parent.type === 'element') slot.parent.properties.dataFile = `${name}.md`
  }
  // The reference list: into the references slot, or at the end of the last box if the template has none
  const references = fill('references', parts.references ? [parts.references] : [])
  if (parts.references && !references) parts.areas.at(-1)?.children.push(parts.references)
  const sections = fill('sections', parts.areas)
  if (sections && sections.parent.type === 'element') sections.parent.properties.dataPosterGrid = ''
  else diagnostics.push({ severity: 'error', message: 'The template has no <slot name="sections"> inside an element', file: path })
  if (!page) diagnostics.push({ severity: 'warning', message: 'The template has no element with class="poster" (the page)', file: path })

  // Settings: the custom properties the template declares
  const declared = new Set(styles.join('\n').match(/--[\w-]+(?=\s*:)/g))
  for (const property of ['--width', '--height']) {
    if (!declared.has(property)) diagnostics.push({ severity: 'warning', message: `The template does not set ${property} (the page size)`, file: path })
  }
  for (const property of Object.keys(manifest.settings)) {
    if (!declared.has(property)) diagnostics.push({ severity: 'warning', message: `The template has no setting "${property.slice(2)}"`, file: 'poster.yaml' })
  }
  const settings = Object.entries(manifest.settings).map(([property, value]) => `  ${property}: ${value};`)

  const html = tree.children.find((node): node is Element => node.type === 'element' && node.tagName === 'html')!
  const head = html.children.find((node): node is Element => node.type === 'element' && node.tagName === 'head')!
  html.properties.lang = manifest.lang
  html.properties.className = [...(Array.isArray(html.properties.className) ? html.properties.className.map(String) : []), ...manifest.variants.map((name) => `variant-${name}`)]
  const element = (tagName: string, properties: Element['properties'], text?: string): Element => ({
    type: 'element',
    tagName,
    properties,
    children: text === undefined ? [] : [{ type: 'text', value: text }],
  })
  head.children.unshift(element('meta', { httpEquiv: ['Content-Security-Policy'], content: policy }))
  head.children.push(element('style', { id: 'poster-engine' }, `${engineCss}\n${parts.layoutCss}\n`))
  if (settings.length) head.children.push(element('style', { id: 'poster-settings' }, `:root {\n${settings.join('\n')}\n}\n`))
  if (!tree.children.some((node) => node.type === 'doctype')) tree.children.unshift({ type: 'doctype' })

  return { html: toHtml(tree), diagnostics }
}
