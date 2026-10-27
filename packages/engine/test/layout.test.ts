import { describe, expect, it } from 'vitest'
import { readLayout } from '../src/layout.ts'
import { readManifest } from '../src/manifest.ts'

const manifest = (yaml: string) => {
  const result = readManifest(yaml)
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  return result.manifest!
}

const layout = (yaml: string, sections: string[]) => readLayout(manifest(yaml), sections)

describe('poster.yaml', () => {
  it('reads all entries and fills in defaults', () => {
    const result = manifest(`
lang: de
variant: compact
settings:
  font-size: 30pt
  --columns: 3
layout: |
  a b
rows: auto 1fr
text-columns:
  b: 2
order: [b, a]
`)
    expect(result).toEqual({
      template: 'template.html',
      lang: 'de',
      variants: ['compact'],
      settings: { '--font-size': '30pt', '--columns': '3' },
      layout: 'a b\n',
      layoutLine: 8,
      rows: 'auto 1fr',
      columns: undefined,
      textColumns: { b: 2 },
      order: ['b', 'a'],
    })
  })

  it('reports YAML errors with their line', () => {
    const { manifest, diagnostics } = readManifest('layout: |\n  a b\ntitle: Telemonitoring: a pilot study\n')
    expect(manifest).toBeUndefined()
    expect(diagnostics[0]).toMatchObject({ severity: 'error', file: 'poster.yaml', line: 3 })
  })

  it('asks for "layout: |" when the rows of the map would be joined', () => {
    const { diagnostics } = readManifest('layout:\n  a b\n  c d\n')
    expect(diagnostics).toMatchObject([{ severity: 'error', line: 1, message: expect.stringContaining('layout: |') }])
  })

  it('needs a layout', () => {
    expect(readManifest('lang: en\n').diagnostics).toMatchObject([{ severity: 'error', message: expect.stringContaining('needs a layout') }])
  })

  it('rejects setting values that would end the CSS rule', () => {
    const { diagnostics } = readManifest('layout: main\nsettings:\n  primary: "red; } body { display: none"\n')
    expect(diagnostics).toMatchObject([{ severity: 'error', line: 2 }])
  })

  it('warns about unknown entries', () => {
    const { manifest, diagnostics } = readManifest('layout: main\ncolumns: 1fr\ntitel: x\n')
    expect(manifest).toBeDefined()
    expect(diagnostics).toMatchObject([{ severity: 'warning', line: 3, message: expect.stringContaining('"titel"') }])
  })
})

describe('layout map', () => {
  const sections = ['background', 'methods', 'results', 'discussion', 'conclusion']
  const map = `layout: |
  background  results     results
  methods     results     results
  methods     discussion  conclusion
`

  it('turns the map into grid areas', () => {
    const { layout: result, diagnostics } = layout(map, sections)
    expect(diagnostics).toEqual([])
    expect(result!.css).toContain('grid-template-areas: "background results results" "methods results results" "methods discussion conclusion";')
    expect(result!.css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(result!.css).toContain('grid-template-rows: repeat(3, auto);')
  })

  it('orders the boxes column by column', () => {
    expect(layout(map, sections).layout!.areas.map((area) => area.name)).toEqual(['background', 'methods', 'results', 'discussion', 'conclusion'])
  })

  it('reads full-width rows below the columns after them', () => {
    const wide = 'layout: |\n  background  results\n  methods     results\n  discussion  discussion\n  conclusion  conclusion\n'
    expect(layout(wide, sections).layout!.areas.map((area) => area.name)).toEqual(['background', 'methods', 'results', 'discussion', 'conclusion'])
    const top = 'layout: |\n  methods methods\n  results discussion\n  results conclusion\n'
    expect(layout(top, sections).layout!.areas.map((area) => area.name)).toEqual(['methods', 'results', 'discussion', 'conclusion'])
  })

  it('warns when rows lists another number of heights than the map has rows', () => {
    expect(layout(`${map}rows: auto 1fr\n`, sections).diagnostics).toEqual([
      { severity: 'warning', message: 'rows: 2 heights for 3 rows of the layout map; the other rows are auto', file: 'poster.yaml' },
    ])
    expect(layout(`${map}rows: repeat(3, auto)\n`, sections).diagnostics).toEqual([])
  })

  it('follows "order" where given', () => {
    const result = layout(`${map}order: [results, background]\n`, sections)
    expect(result.layout!.areas.map((area) => area.name)).toEqual(['results', 'background', 'methods', 'discussion', 'conclusion'])
  })

  it('sets the text columns of a box to the grid columns it spans', () => {
    const { areas, css } = layout(map, sections).layout!
    expect(areas.find((area) => area.name === 'results')).toMatchObject({ row: 1, column: 2, rows: 2, columns: 2, textColumns: 2 })
    expect(css).toContain('[data-area="results"] { grid-area: results; column-count: 2; }')
    expect(css).toContain('[data-area="methods"] { grid-area: methods; }')
  })

  it('names the sides of the grid each box touches', () => {
    const edges = Object.fromEntries(layout(map, sections).layout!.areas.map((area) => [area.name, area.edges]))
    expect(edges).toEqual({
      background: ['top', 'left'],
      methods: ['bottom', 'left'],
      results: ['top', 'right'],
      discussion: ['bottom'],
      conclusion: ['right', 'bottom'],
    })
  })

  it('lets text-columns override the default', () => {
    const { areas } = layout(`${map}text-columns:\n  results: 1\n`, sections).layout!
    expect(areas.find((area) => area.name === 'results')!.textColumns).toBe(1)
  })

  it('passes rows and columns on', () => {
    const { css } = layout(`${map}rows: auto auto 1fr\ncolumns: 1fr 2fr 2fr\n`, sections).layout!
    expect(css).toContain('grid-template-rows: auto auto 1fr;')
    expect(css).toContain('grid-template-columns: 1fr 2fr 2fr;')
  })

  it('accepts empty cells', () => {
    const { layout: result, diagnostics } = layout('layout: |\n  a .\n  a b\n', ['a', 'b'])
    expect(diagnostics).toEqual([])
    expect(result!.css).toContain('grid-template-areas: "a ." "a b";')
  })

  it('reports a box that is not a rectangle, with its line in poster.yaml', () => {
    const { layout: result, diagnostics } = layout('lang: en\nlayout: |\n  a b\n  b b\n', ['a', 'b'])
    expect(result).toBeUndefined()
    expect(diagnostics).toMatchObject([{ severity: 'error', file: 'poster.yaml', line: 3, message: expect.stringContaining('"b" must form a rectangle') }])
  })

  it('reports rows of different length', () => {
    const { diagnostics } = layout('layout: |\n  a b\n  a\n', ['a', 'b'])
    expect(diagnostics).toMatchObject([{ severity: 'error', line: 3 }])
  })

  it('reports invalid names', () => {
    const { diagnostics } = layout('layout: |\n  01-intro b\n', ['b'])
    expect(diagnostics).toMatchObject([{ severity: 'error', message: expect.stringContaining('"01-intro"') }])
  })

  it('warns about boxes without a file and files without a box', () => {
    const { layout: result, diagnostics } = layout('layout: |\n  a b\n', ['a', 'c'])
    expect(result).toBeDefined()
    expect(diagnostics).toEqual([
      { severity: 'warning', message: 'The box "b" has no file sections/b.md', file: 'poster.yaml', line: 2 },
      { severity: 'warning', message: 'sections/c.md is not shown: add "c" to the layout map in poster.yaml', file: 'sections/c.md' },
    ])
  })


  it('treats a single name as the whole page (one flowing box)', () => {
    const { areas, css } = layout('layout: main\ntext-columns:\n  main: 2\n', ['main']).layout!
    expect(areas).toEqual([{ name: 'main', row: 1, column: 1, rows: 1, columns: 1, textColumns: 2, edges: ['top', 'right', 'bottom', 'left'] }])
    expect(css).toContain('grid-template-areas: "main";')
    expect(css).toContain('column-count: 2;')
  })
})
