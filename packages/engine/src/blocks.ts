// The engine's own markup, added after raw HTML has been sanitized: ::figure, ::table, ::chart, :::wide, ```mermaid diagrams,
// and the files behind pictures. Diagrams are placeholders (<div class="diagram" data-source>) that finish() draws.
import type { Element, ElementContent, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import { chartSource, parseCsv } from './csv.ts'
import { report } from './messages.ts'

/** The files of the poster folder that Markdown may refer to (resources/…). */
export type Resources = { paths: Set<string>; read(path: string): Promise<string | undefined>; url(path: string): string }

const chartTypes = ['bar', 'line', 'pie']

export function rehypeBlocks(resources: Resources) {
  return async (tree: Root, file: VFile) => {
    visit(tree, 'element', (node, index, parent) => {
      const code = node.tagName === 'pre' ? node.children.find(isElement) : undefined
      if (code?.tagName !== 'code' || !String(code.properties.className ?? '').includes('language-mermaid') || !parent || index === undefined) return
      parent.children[index] = diagram(textOf(code), node)
      return SKIP
    })

    const pending: Promise<void>[] = []
    visit(tree, 'element', (node, index, parent) => {
      if ((node.tagName !== 'x-table' && node.tagName !== 'x-chart') || !parent || index === undefined) return
      pending.push(dataBlock(node, resources, file).then((block) => void (parent.children[index] = block)))
      return SKIP
    })
    await Promise.all(pending)

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'x-figure' || !parent || index === undefined) return
      parent.children[index] = figure(node, file)
    })

    visit(tree, 'element', (node) => {
      if (node.tagName === 'img') picture(node, resources, file)
      // :::wide … ::: spans all text columns of its box
      if (node.tagName === 'x-wide') Object.assign(node, { tagName: 'div', properties: { className: ['wide'] } })
      // An unknown directive (reported by remarkBlocks)
      if (node.tagName === 'x-error') Object.assign(node, { tagName: 'p', properties: { className: ['error'] } })
    })
  }
}

/**
 * ::figure[Caption]{src=… width=… wide}, or :::figure with Markdown inside: paragraphs above the picture (![](…) or a diagram)
 * are its title, paragraphs below it its caption; a label (:::figure[Caption]) replaces the caption. width applies to the picture only.
 */
function figure(node: Element, file: VFile): Element {
  const { src, width, ...rest } = argsOf(node)
  const leaf = node.properties.dataKind === 'leaf'
  const label = node.children.find((child): child is Element => isElement(child) && child.tagName === 'x-caption')
  const blocks = node.children.filter((child): child is Element => isElement(child) && child !== label)
  let picture: ElementContent[]
  let title: Element[] = []
  let below: Element[] = []
  if (src) {
    picture = [h('img', { src, alt: '' })]
    below = leaf ? [] : blocks
  } else if (leaf) {
    picture = [error(file, '::figure needs a picture, for example ::figure[Caption]{src=resources/photo.png}', node)]
  } else {
    const at = blocks.findIndex((block) => block.tagName !== 'p' || imageIn(block))
    picture = at < 0 ? blocks : [imageIn(blocks[at]) ?? blocks[at]]
    title = at > 0 ? blocks.slice(0, at) : []
    below = at < 0 ? [] : blocks.slice(at + 1)
  }
  const caption = leaf ? (node.children.length > 0 ? node.children : undefined) : label ? label.children : below.length > 0 ? lines(below) : undefined
  return h('figure', isWide(rest) ? { className: ['wide'] } : {}, [
    ...(title.length > 0 ? [h('div', { className: ['figure-title'] }, lines(title))] : []),
    ...sized(picture, width, node, file),
    ...(caption ? [h('figcaption', {}, caption)] : []),
  ])
}

/** ::table[Caption]{src=resources/data.csv wide}, or ::chart[Caption]{src=… type=bar|line|pie y="Axis title" horizontal width=80% wide}. */
async function dataBlock(node: Element, resources: Resources, file: VFile): Promise<Element> {
  const { src, type = 'bar', y, width, ...rest } = argsOf(node)
  const kind = node.tagName.slice(2)
  const wide = isWide(rest) ? ['wide'] : []
  const caption = node.children.length > 0 ? [h('figcaption', {}, node.children)] : []
  if (!src) return error(file, `::${kind} needs a CSV file, for example ::${kind}[Caption]{src=resources/data.csv}`, node)
  const path = find(src, resources, file, node)
  const text = path === undefined ? undefined : await resources.read(path)
  if (text === undefined) return error(file, `File not found: ${src}`, node, false)
  const [head = [], ...body] = parseCsv(text)

  if (kind === 'table') {
    const cells = (row: string[], tagName: string) => h('tr', {}, row.map((cell) => h(tagName, {}, [{ type: 'text', value: cell }])))
    return h('figure', { className: ['table', ...wide] }, [...caption, h('table', {}, [h('thead', {}, [cells(head, 'th')]), h('tbody', {}, body.map((row) => cells(row, 'td')))])])
  }
  if (!chartTypes.includes(type)) report(file, 'warning', `type="${type}" is not a chart type; use bar, line or pie`, node)
  const source = chartSource([head, ...body], { type: chartTypes.includes(type) ? type : 'bar', y, horizontal: 'horizontal' in rest })
  return h('figure', wide.length ? { className: wide } : {}, [...sized([diagram(source, node)], width, node, file), ...caption])
}

/** Pictures are files of the poster folder; the page shows them through resources.url (a blob: URL in the browser). */
function picture(node: Element, resources: Resources, file: VFile) {
  const src = String(node.properties.src ?? '')
  if (/^([a-z][\w+.-]*:|\/)/i.test(src)) {
    report(file, 'error', `Pictures must be files in the poster folder, for example resources/photo.png (not ${src})`, node)
    return
  }
  const path = find(src, resources, file, node)
  if (path !== undefined) node.properties.src = resources.url(path)
}

/** The path of a file the Markdown refers to, or undefined (and a message) if there is no such file. */
function find(src: string, resources: Resources, file: VFile, node: Element) {
  let path = src.replace(/^\.\//, '')
  try {
    path = decodeURI(path)
  } catch {}
  if (resources.paths.has(path)) return path
  const similar = [...resources.paths].find((candidate) => candidate.toLowerCase() === path.toLowerCase())
  report(file, 'error', `File not found: ${src}${similar ? ` (did you mean ${similar}? Capital letters must match)` : ''}`, node)
}

function diagram(source: string, from: Element) {
  return h('div', { className: ['diagram'], dataSource: source, dataLine: from.position?.start.line }, [])
}

/** width="70%" puts the picture into a narrower, centred box. */
function sized(picture: ElementContent[], width: string | undefined, node: Element, file: VFile): ElementContent[] {
  if (width === undefined) return picture
  if (/^\d+(\.\d+)?(%|mm|cm|pt|px|em)$/.test(width)) return [h('div', { style: `width: ${width}; margin-inline: auto` }, picture)]
  report(file, 'warning', `width=${width} is not a width; write for example width=70%`, node)
  return picture
}

/** The image of a Markdown paragraph that holds nothing else: ![](resources/photo.png) */
function imageIn(block: Element) {
  const children = block.children.filter((child) => child.type !== 'text' || child.value.trim())
  return block.tagName === 'p' && children.length === 1 && isElement(children[0]) && children[0].tagName === 'img' ? children[0] : undefined
}

/** The contents of Markdown paragraphs, one per line (the "Fig. 1" label must stay inline). */
function lines(blocks: Element[]): ElementContent[] {
  return blocks.flatMap((block, i) => [...(i > 0 ? [h('br', {})] : []), ...(block.tagName === 'p' ? block.children : [block])])
}

function error(file: VFile, message: string, node: Element, record = true) {
  if (record) report(file, 'error', message, node)
  return h('p', { className: ['error'] }, [{ type: 'text', value: message }])
}

/** The attributes of the directive ({src=… width=70% wide}), as remarkBlocks stored them. */
function argsOf(node: Element): Record<string, string> {
  try {
    return JSON.parse(String(node.properties.dataArgs ?? '{}'))
  } catch {
    return {}
  }
}

const isWide = (args: Record<string, string>) => 'wide' in args || (args.class ?? '').split(/\s+/).includes('wide')
const isElement = (node: unknown): node is Element => (node as Element | undefined)?.type === 'element'
const textOf = (node: Element): string => node.children.map((child) => (child.type === 'text' ? child.value : isElement(child) ? textOf(child) : '')).join('')
const h = (tagName: string, properties: Element['properties'], children: ElementContent[] = []): Element => ({ type: 'element', tagName, properties, children })
