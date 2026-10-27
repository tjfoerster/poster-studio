import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from '../src/index.ts'
import type { PosterFiles } from '../src/types.ts'
import { folderFiles } from './folder.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const example = `${repository}examples/welcome`
const template = (name: string) => readFileSync(`${repository}templates/${name}.html`, 'utf8')
/** The templates in templates/: the neutral one, and locally any others (they are not in the repository). */
const templates = readdirSync(`${repository}templates`).filter((name) => name.endsWith('.html')).map((name) => name.slice(0, -'.html'.length))
const resolveUrl = (path: string) => `blob:${path}`

/** A poster folder from a few files; a minimal template unless the files bring one. */
const poster = (files: Record<string, string>): PosterFiles => {
  const all: Record<string, string> = {
    'template.html': '<!doctype html><html><head><style>:root { --width: 841mm; --height: 1189mm; --gap: 10mm }</style></head><body><article class="poster"><header><slot name="header"></slot></header><main><slot name="sections"></slot></main><aside><slot name="references"></slot></aside><footer><slot name="footer"></slot></footer></article></body></html>',
    'header.md': '# Title',
    ...files,
  }
  return { list: async () => Object.keys(all), read: async (path) => (path in all ? new Blob([all[path]]) : undefined) }
}

const body = (html: string) => html.slice(html.indexOf('<body'))

describe('the example poster', () => {
  it('uses an unchanged copy of the neutral template', () => {
    expect(readFileSync(`${example}/template.html`, 'utf8')).toBe(template('neutral'))
  })

  for (const name of templates) {
    it(`builds without problems with the ${name} template`, async () => {
      const result = await build({ files: folderFiles(example, { 'template.html': template(name) }), resolveUrl })
      expect(result.diagnostics).toEqual([])
      expect(result.html).toContain('<main data-poster-grid="">')
      expect(result.html).toContain('<section class="area" data-area="results" data-edge="right left" data-file="sections/results.md"><h2>Results</h2>')
      expect(result.html).toContain('<img src="blob:resources/qr-code.svg" alt="QR code">')
      expect(result.html).toContain('<img src="blob:resources/editor.png" alt="">')
    })
  }
})

describe('build', () => {
  it('fills the slots and puts the boxes in reading order', async () => {
    const { html, diagnostics } = await build({
      files: poster({ 'poster.yaml': 'layout: |\n  b a\n', 'sections/a.md': '## A', 'sections/b.md': '## B', 'footer.md': 'Contact' }),
      resolveUrl,
    })
    expect(diagnostics).toEqual([])
    expect(body(html)).toContain('<header data-file="header.md"><h1>Title</h1></header><main data-poster-grid=""><section class="area" data-area="b" data-edge="top bottom left" data-file="sections/b.md"><h2>B</h2></section><section class="area" data-area="a" data-edge="top right bottom"')
    expect(html).toContain('<footer data-file="footer.md"><p>Contact</p></footer>')
    expect(html).not.toContain('<slot')
  })

  it('numbers references across files and lists them in the references slot of the template', async () => {
    const { html, diagnostics } = await build({
      files: poster({
        'poster.yaml': 'layout: |\n  a b\n',
        'sections/a.md': 'First[^x].\n\n[^x]: Reference X.',
        'sections/b.md': 'Second[^y], first again[^x].\n\n[^y]: Reference Y.',
      }),
      resolveUrl,
    })
    expect(diagnostics).toEqual([])
    expect(html).toMatch(/<\/main><aside><section data-footnotes class="footnotes">.*<p>Reference X\..*<p>Reference Y\./s)
    expect(html).toMatch(/First<sup><a [^>]*>1<\/a><\/sup>/)
    expect(html).toMatch(/Second<sup><a [^>]*>2<\/a><\/sup>, first again<sup><a [^>]*>1<\/a><\/sup>/)
  })

  it('ends the last box with the references if the template has no place for them', async () => {
    const template = '<html><head><style>:root { --width: 1mm; --height: 1mm }</style></head><body><div class="poster"><main><slot name="sections"></slot></main></div></body></html>'
    const files = poster({ 'poster.yaml': 'layout: |\n  a b\n', 'sections/a.md': 'A[^x].\n\n[^x]: X.', 'sections/b.md': 'B', 'template.html': template })
    const { html } = await build({ files, resolveUrl })
    expect(html).toMatch(/data-area="b"[^>]*><p>B<\/p><section data-footnotes class="footnotes">/)
  })

  it('leaves the references slot empty without references', async () => {
    const { html } = await build({ files: poster({ 'poster.yaml': 'layout: a', 'sections/a.md': 'No references.' }), resolveUrl })
    expect(html).toContain('<aside></aside>')
  })

  it('splits a :::figure into title, picture and caption', async () => {
    const figure = ':::figure{width=50%}\nThe title\n\n![](resources/a.png)\n\n**Bold** caption\n:::'
    const { html, diagnostics } = await build({ files: poster({ 'poster.yaml': 'layout: a', 'sections/a.md': figure, 'resources/a.png': '' }), resolveUrl })
    expect(diagnostics).toEqual([])
    expect(html).toContain(
      '<figure><div class="figure-title">The title</div><div style="width: 50%; margin-inline: auto"><img src="blob:resources/a.png" alt=""></div><figcaption><strong>Bold</strong> caption</figcaption></figure>',
    )
  })

  it('makes tables and chart placeholders from CSV files', async () => {
    const files = poster({
      'poster.yaml': 'layout: a',
      'sections/a.md': '::table[Groups.]{src=resources/t.csv}\n\n::chart[Chart.]{src=resources/t.csv type=line}',
      'resources/t.csv': 'Group;n\nA;1,5\n',
    })
    const { html, diagnostics } = await build({ files, resolveUrl })
    expect(diagnostics).toEqual([])
    expect(html).toContain('<figure class="table"><figcaption>Groups.</figcaption><table><thead><tr><th>Group</th><th>n</th></tr></thead><tbody><tr><td>A</td><td>1,5</td></tr></tbody></table></figure>')
    expect(html).toContain('<figure><div class="diagram" data-source="xychart\n  x-axis &#x22;Group&#x22; [&#x22;A&#x22;]\n  line &#x22;n&#x22; [1.5]" data-line="3"></div><figcaption>Chart.</figcaption></figure>')
  })

  it('reports problems with the file and line where they can be fixed, and keeps building', async () => {
    const files = poster({
      'poster.yaml': 'layout: a',
      'sections/a.md': '## A\n\n::foto{src=x.png}\n\n![](resources/Photo.png)\n\n::table{src=resources/missing.csv}\n\n> [!no-such-icon] Text',
      'resources/photo.png': '',
    })
    const { html, diagnostics } = await build({ files, resolveUrl })
    expect(diagnostics).toEqual([
      { severity: 'error', message: 'Unknown block "::foto". Possible blocks: ::figure, :::figure, ::table, ::chart', file: 'sections/a.md', line: 3 },
      { severity: 'error', message: 'File not found: resources/Photo.png (did you mean resources/photo.png? Capital letters must match)', file: 'sections/a.md', line: 5 },
      { severity: 'error', message: 'File not found: resources/missing.csv', file: 'sections/a.md', line: 7 },
      { severity: 'warning', message: 'Unknown icon "no-such-icon". Find the name of an icon on https://lucide.dev/icons', file: 'sections/a.md', line: 9 },
    ])
    expect(html).toContain('<p class="error">Unknown block "::foto".')
    expect(html).toContain('<p class="error">File not found: resources/missing.csv</p>')
  })

  it('takes <, braces and lone stars as text', async () => {
    const { html, diagnostics } = await build({ files: poster({ 'poster.yaml': 'layout: a', 'sections/a.md': 'p<0.05 in {all} groups, ***p < 0.001' }), resolveUrl })
    expect(diagnostics).toEqual([])
    expect(html).toContain('<p>p&#x3C;0.05 in {all} groups, ***p &#x3C; 0.001</p>')
  })

  it('keeps text that only looks like a directive', async () => {
    const { html } = await build({ files: poster({ 'poster.yaml': 'layout: a', 'sections/a.md': 'Ratio A:B was 3:1, see https://example.org.' }), resolveUrl })
    expect(html).toContain('<p>Ratio A:B was 3:1, see <a href="https://example.org">https://example.org</a>.</p>')
  })

  it('allows a little inline HTML and removes the rest', async () => {
    const text = '<u>Name</u><sup>1</sup> H<sub>2</sub>O<br>\n\n<script>alert(1)</script>\n\n<img src="resources/a.png" onerror="alert(1)">\n\n<!-- a note -->'
    const { html } = await build({ files: poster({ 'poster.yaml': 'layout: a', 'sections/a.md': text, 'resources/a.png': '' }), resolveUrl })
    const section = html.slice(html.indexOf('<section'), html.indexOf('</main>'))
    expect(section).toContain('<u>Name</u><sup>1</sup> H<sub>2</sub>O<br>')
    expect(section).not.toMatch(/script|alert|onerror|a note/)
    expect(section).toContain('<img src="blob:resources/a.png">')
  })

  it('applies language, variant and settings, and removes scripts from the template', async () => {
    const files = poster({
      'poster.yaml': 'lang: de\nvariant: compact\nsettings:\n  gap: 5mm\n  colour: red\nlayout: a',
      'sections/a.md': 'Text',
      'template.html': '<html><head><style>:root { --width: 1mm; --height: 1mm; --gap: 1mm }</style><script>alert(1)</script></head><body onload="alert(1)"><div class="poster"><main><slot name="sections"></slot></main></div></body></html>',
    })
    const { html, diagnostics } = await build({ files, resolveUrl })
    expect(html.startsWith('<!doctype html><html lang="de" class="variant-compact"><head><meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(html).toContain('<style id="poster-settings">:root {\n  --gap: 5mm;\n  --colour: red;\n}\n</style>')
    expect(html).not.toMatch(/alert/)
    expect(diagnostics).toEqual([{ severity: 'warning', message: 'The template has no setting "colour"', file: 'poster.yaml' }])
  })

  it('needs a sections slot in the template', async () => {
    const files = poster({ 'poster.yaml': 'layout: a', 'sections/a.md': 'Text', 'template.html': '<div class="poster">No slots</div><style>:root { --width: 1mm; --height: 1mm }</style>' })
    const { diagnostics } = await build({ files, resolveUrl })
    expect(diagnostics).toEqual([{ severity: 'error', message: 'The template has no <slot name="sections"> inside an element', file: 'template.html' }])
  })

  it('shows a page with the errors when there is nothing to lay out', async () => {
    const { html, diagnostics } = await build({ files: poster({ 'poster.yaml': 'layout:\n  a b\n  c d' }), resolveUrl })
    expect(diagnostics).toHaveLength(1)
    expect(html).toContain('<h1>The poster cannot be shown</h1>')
    expect(html).toContain('poster.yaml:1')
  })
})
