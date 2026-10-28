// Markdown to HTML for header.md, footer.md and the section files: GFM, a little inline HTML, ::figure, ::table, ::chart,
// ```mermaid and icons. Raw HTML is sanitized first; the engine's own markup (blocks.ts, icons.ts) is added afterwards.
import type { Element, ElementContent, Root } from 'hast'
import type { Root as MarkdownRoot, RootContent } from 'mdast'
import type {} from 'mdast-util-directive'
import { toHast } from 'mdast-util-to-hast'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'
import { VFile } from 'vfile'
import { type Resources, rehypeBlocks } from './blocks.ts'
import { rehypeIcons } from './icons.ts'
import { diagnosticsOf, report } from './messages.ts'
import type { Diagnostic } from './types.ts'

export type Source = { path: string; text: string }

const blockNames = ['figure', 'table', 'chart']
const directiveAttributes = ['dataArgs', 'dataKind']

/**
 * Allowed in the Markdown files: GitHub's safe HTML, plus <u> and the directives marked by remarkBlocks. No second
 * "user-content-" prefix on ids (to-hast adds one to footnotes already); the page runs no scripts that ids could clobber.
 */
const schema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'x-figure', 'x-table', 'x-chart', 'x-wide', 'x-caption', 'x-error'],
  attributes: { ...defaultSchema.attributes, 'x-figure': directiveAttributes, 'x-table': directiveAttributes, 'x-chart': directiveAttributes },
}

// singleTilde: false keeps ~ for approximate values ("~5 %") instead of striking through
const markdown = unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkDirective).use(remarkBlocks)

const html = (resources: Resources) => unified().use(rehypeRaw).use(rehypeSanitize, schema).use(rehypeIcons).use(rehypeBlocks, resources)

/** header.md or footer.md, on its own. */
export async function renderPart(source: Source, resources: Resources): Promise<{ children: ElementContent[]; diagnostics: Diagnostic[] }> {
  const file = new VFile({ path: source.path, value: source.text })
  const tree = (await markdown.run(markdown.parse(file), file)) as MarkdownRoot
  const result = await html(resources).run(toHast(tree, { allowDangerousHtml: true }) as Root, file)
  return { children: result.children as ElementContent[], diagnostics: diagnosticsOf(file) }
}

/**
 * The boxes of the layout in reading order, each a <section class="area" data-area data-edge> with the content of its file
 * (if any); data-edge names the sides of the grid the box touches ("top right"), for templates.
 * All files are turned into HTML as one document, so footnotes ([^1]) are numbered across the whole poster;
 * the reference list comes back separately.
 */
export async function renderSections(boxes: { area: string; edges: string[]; source?: Source }[], resources: Resources) {
  // Markdown links a reference ([^x]) to its definition ([^x]: …) only within one file. For references to definitions in
  // other files, stub definitions are added while parsing and removed afterwards; to-hast then finds the real definition.
  const labels = boxes.map(({ source }) => [...(source?.text ?? '').matchAll(/^ {0,3}\[\^([^\]\s]+)\]:/gm)].map((match) => match[1]))
  const normal = (label: string) => label.toLowerCase()
  const files = boxes.map(({ source }, i) => {
    if (!source) return new VFile()
    const own = new Set(labels[i].map(normal))
    const others = [...new Set(labels.flat().filter((label) => !own.has(normal(label))))]
    const stubs = others.length > 0 && source.text.includes('[^') ? `\n\n${others.map((label) => `[^${label}]: -`).join('\n')}\n` : ''
    return new VFile({ path: source.path, value: source.text + stubs })
  })
  const trees = await Promise.all(
    boxes.map(async ({ source }, i) => {
      if (!source) return undefined
      const tree = (await markdown.run(markdown.parse(files[i]), files[i])) as MarkdownRoot
      tree.children = tree.children.filter((node) => node.type !== 'footnoteDefinition' || node.position!.start.offset! < source.text.length)
      return tree
    }),
  )

  const definedIn = new Map<string, string>()
  trees.forEach((tree, i) =>
    tree &&
      visit(tree, 'footnoteDefinition', (node) => {
        const other = definedIn.get(node.identifier)
        if (other) report(files[i], 'warning', `The reference [^${node.label ?? node.identifier}] is also defined in ${other}; give one of them another name`, node)
        else definedIn.set(node.identifier, files[i].path)
      }),
  )

  // Each file becomes the content of its box; to-hast turns an unknown node with data.hName into that element
  const document: MarkdownRoot = {
    type: 'root',
    children: boxes.map(({ area, edges, source }, i) => {
      const properties = { className: ['area'], dataArea: area, dataEdge: edges.join(' '), dataFile: source?.path }
      return { type: 'posterArea', data: { hName: 'section', hProperties: properties }, children: trees[i]?.children ?? [] } as unknown as RootContent
    }),
  }
  const root = toHast(document, { allowDangerousHtml: true }) as Root
  const elements = root.children.filter((node): node is Element => node.type === 'element')
  const areas = elements.filter((element) => element.properties.dataArea !== undefined)
  const references = elements.find((element) => element.properties.dataFootnotes !== undefined)

  const processor = html(resources)
  await Promise.all(
    areas.map(async (area, i) => {
      area.children = (await processor.run({ type: 'root', children: area.children }, files[i])).children as ElementContent[]
    }),
  )
  const referencesFile = new VFile()
  if (references) references.children = (await processor.run({ type: 'root', children: references.children }, referencesFile)).children as ElementContent[]

  const diagnostics = [...files, referencesFile].flatMap(diagnosticsOf)
  return { areas, references, diagnostics }
}

/** Marks ::figure, :::figure, ::table, ::chart and :::wide for rehypeBlocks. ":word" inside text stays text ("ratio A:B" is no directive). */
function remarkBlocks() {
  return (tree: MarkdownRoot, file: VFile) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'textDirective' && parent && index !== undefined) {
        const { start, end } = node.position!
        ;(parent.children as RootContent[])[index] = { type: 'text', value: String(file.value).slice(start.offset, end.offset) }
        return SKIP
      }
      if (node.type !== 'leafDirective' && node.type !== 'containerDirective') return
      const marker = node.type === 'leafDirective' ? '::' : ':::'
      if (node.type === 'containerDirective' && node.name === 'wide') {
        node.data = { hName: 'x-wide' }
        return
      }
      if (!blockNames.includes(node.name) || (node.type === 'containerDirective' && node.name !== 'figure')) {
        const message = `Unknown block "${marker}${node.name}". Possible blocks: ::figure, :::figure, ::table, ::chart, :::wide`
        report(file, 'error', message, node)
        node.data = { hName: 'x-error', hChildren: [{ type: 'text', value: message }] }
        return SKIP
      }
      if (node.type === 'containerDirective') {
        const label = node.children.find((child) => child.type === 'paragraph' && child.data?.directiveLabel)
        if (label) label.data = { ...label.data, hName: 'x-caption' }
      }
      node.data = { hName: `x-${node.name}`, hProperties: { dataArgs: JSON.stringify(node.attributes ?? {}), dataKind: node.type === 'leafDirective' ? 'leaf' : 'container' } }
    })
  }
}
