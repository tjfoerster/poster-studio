// Icons for highlighted boxes: "> [!goal] Text" puts the Lucide icon "goal" (https://lucide.dev/icons) into the box.
// Runs while the poster is built, so the icon is plain SVG in the page and in the PDF.
import type { Element, Root } from 'hast'
import { type IconNode, icons } from 'lucide'
import type { VFile } from 'vfile'

const marker = /^\[!([\w-]+)\]\s*/

export function rehypeIcons() {
  return (tree: Root, file: VFile) => {
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== 'element') continue
        if (child.tagName === 'blockquote') addIcon(child, file)
        visit(child)
      }
    }
    visit(tree)
  }
}

/** Replaces "[!name]" at the start of a blockquote by <span class="icon"><svg>, the first child of the blockquote.
    The span draws the dot: a rounded <svg> would cut off the corners of the icon. */
function addIcon(quote: Element, file: VFile) {
  const paragraph = quote.children.find((child): child is Element => child.type === 'element')
  if (paragraph?.tagName !== 'p') return
  const text = paragraph.children[0]
  if (text?.type !== 'text') return
  const match = marker.exec(text.value)
  if (!match) return

  const name = match[1].toLowerCase()
  const icon = (icons as Record<string, IconNode | undefined>)[name.replace(/(?:^|-)(\w)/g, (_, char: string) => char.toUpperCase())]
  if (!icon) {
    file.message(`Unknown icon "${name}". Find the name of an icon on https://lucide.dev/icons`, text)
    return
  }

  // "> [!goal]" on a line of its own leaves an empty text or paragraph behind
  text.value = text.value.slice(match[0].length)
  if (!text.value) paragraph.children.shift()
  if (!paragraph.children.length) quote.children.splice(quote.children.indexOf(paragraph), 1)

  const svg: Element = {
    type: 'element',
    tagName: 'svg',
    properties: {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ariaHidden: 'true',
    },
    children: icon.map(([tagName, properties]) => ({ type: 'element', tagName, properties, children: [] })),
  }
  quote.children.unshift({ type: 'element', tagName: 'span', properties: { className: ['icon'] }, children: [svg] })
}
