// The poster engine: turns a poster folder (poster.yaml, template.html, header.md, footer.md, sections/*.md, resources/)
// into one self-contained HTML page. build() runs in Node and in the browser; finish() (./finish.ts) completes the page in a DOM.
import type { Element } from 'hast'
import { readLayout } from './layout.ts'
import { readManifest } from './manifest.ts'
import { renderPart, renderSections, type Source } from './markdown.ts'
import { fillTemplate } from './template.ts'
import type { Diagnostic, PosterFiles } from './types.ts'

export type { Diagnostic, PosterFiles } from './types.ts'

export type BuildOptions = {
  files: PosterFiles
  /** The URL under which the page can load a file of the poster folder, e.g. a blob: URL. */
  resolveUrl(path: string): string
}

export type BuildResult = { html: string; diagnostics: Diagnostic[] }

export async function build({ files, resolveUrl }: BuildOptions): Promise<BuildResult> {
  const paths = new Set(await files.list())
  const read = async (path: string) => (paths.has(path) ? await (await files.read(path))?.text() : undefined)
  const diagnostics: Diagnostic[] = []

  const manifestText = await read('poster.yaml')
  if (manifestText === undefined) return failed([{ severity: 'error', message: 'The poster folder has no poster.yaml', file: 'poster.yaml' }])
  const { manifest, diagnostics: manifestProblems } = readManifest(manifestText)
  diagnostics.push(...manifestProblems)
  if (!manifest) return failed(diagnostics)

  const template = await read(manifest.template)
  if (template === undefined) return failed([...diagnostics, { severity: 'error', message: `Template not found: ${manifest.template}`, file: 'poster.yaml' }])

  const sections = [...paths].flatMap((path) => /^sections\/([^/]+)\.md$/.exec(path)?.[1] ?? [])
  const { layout, diagnostics: layoutProblems } = readLayout(manifest, sections)
  diagnostics.push(...layoutProblems)

  const resources = { paths, read, url: resolveUrl }
  const part = async (path: string) => {
    const text = await read(path)
    if (text === undefined) return undefined
    const result = await renderPart({ path, text }, resources)
    diagnostics.push(...result.diagnostics)
    return result.children
  }
  const [header, footer] = await Promise.all([part('header.md'), part('footer.md')])
  if (!header) diagnostics.push({ severity: 'warning', message: 'The poster folder has no header.md (title and authors)', file: 'header.md' })

  let areas: Element[] = []
  let references: Element | undefined
  if (layout) {
    const boxes = await Promise.all(
      layout.areas.map(async ({ name, edges }) => {
        const path = `sections/${name}.md`
        const text = await read(path)
        return { area: name, edges, source: text === undefined ? undefined : ({ path, text } satisfies Source) }
      }),
    )
    const rendered = await renderSections(boxes, resources)
    diagnostics.push(...rendered.diagnostics)
    areas = rendered.areas
    references = rendered.references
  }

  const filled = fillTemplate(template, manifest.template, manifest, { header, footer, areas, references, layoutCss: layout?.css ?? '' })
  diagnostics.push(...filled.diagnostics)
  return { html: filled.html, diagnostics }
}

/** A page that lists the errors, for when there is nothing to lay out. */
function failed(diagnostics: Diagnostic[]): BuildResult {
  const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
  const items = diagnostics.map(({ message, file, line }) => `<li>${escape([file, line].filter(Boolean).join(':'))} ${escape(message)}</li>`)
  const html = `<!doctype html><html><body style="margin: 2rem; font: 18px/1.5 system-ui, sans-serif; color: #1f2a30"><h1>The poster cannot be shown</h1><ul>${items.join('')}</ul></body></html>`
  return { html, diagnostics }
}
