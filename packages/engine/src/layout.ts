// The layout map in poster.yaml: every name is a box filled from sections/<name>.md, "." an empty cell.
// The map becomes CSS grid-template-areas; the boxes follow in reading order (see readingOrder, or "order" in poster.yaml).
import type { Manifest } from './manifest.ts'
import type { Diagnostic } from './types.ts'

/** A box of the grid. row and column count from 1; rows and columns are its span; edges are the sides of the grid it touches. */
type Area = { name: string; row: number; column: number; rows: number; columns: number; textColumns: number; edges: string[] }

/** The boxes in reading order and the CSS that places them. */
type Layout = { areas: Area[]; css: string }


const file = 'poster.yaml'
const name = /^[a-zA-Z][\w-]*$/

/** sections: the names of the files in sections/ (results for sections/results.md). */
export function readLayout(manifest: Manifest, sections: string[]): { layout?: Layout; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const error = (message: string, line = manifest.layoutLine) => diagnostics.push({ severity: 'error', message, file, line })

  const rows: string[][] = []
  const lines: number[] = []
  manifest.layout.split('\n').forEach((text, i) => {
    const cells = text.trim().split(/\s+/).filter(Boolean)
    if (cells.length === 0) return
    rows.push(cells.map((cell) => (/^\.+$/.test(cell) ? '.' : cell)))
    lines.push(manifest.layoutLine + i)
  })
  if (rows.length === 0) error('The layout map is empty')
  rows.forEach((row, i) => {
    if (row.length !== rows[0].length) error(`This row of the layout has ${row.length} boxes, the first row has ${rows[0].length}`, lines[i])
    for (const cell of row) if (cell !== '.' && !name.test(cell)) error(`"${cell}" is not a valid box name: use letters, digits and "-", starting with a letter`, lines[i])
  })
  if (diagnostics.length) return { diagnostics }

  // Each name must cover a rectangle, as CSS requires (otherwise the browser silently ignores the whole map)
  const bounds = new Map<string, { top: number; bottom: number; left: number; right: number; cells: number }>()
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === '.') return
      const box = bounds.get(cell) ?? { top: y, bottom: y, left: x, right: x, cells: 0 }
      bounds.set(cell, { top: Math.min(box.top, y), bottom: Math.max(box.bottom, y), left: Math.min(box.left, x), right: Math.max(box.right, x), cells: box.cells + 1 })
    }),
  )
  for (const [cell, box] of bounds) {
    if (box.cells !== (box.bottom - box.top + 1) * (box.right - box.left + 1)) error(`"${cell}" must form a rectangle in the layout map`, lines[box.top])
  }
  if (diagnostics.length) return { diagnostics }

  for (const cell of bounds.keys()) {
    if (!sections.includes(cell)) {
      diagnostics.push({ severity: 'warning', message: `The box "${cell}" has no file sections/${cell}.md`, file, line: lines[bounds.get(cell)!.top] })
    }
  }
  for (const section of sections) {
    if (!bounds.has(section)) diagnostics.push({ severity: 'warning', message: `sections/${section}.md is not shown: add "${section}" to the layout map in poster.yaml`, file: `sections/${section}.md` })
  }
  for (const area of Object.keys(manifest.textColumns)) {
    if (!bounds.has(area)) diagnostics.push({ severity: 'warning', message: `text-columns: there is no box "${area}" in the layout map`, file })
  }

  const byPosition = readingOrder(
    [...bounds].map(([cell, box]): Area => {
      const columns = box.right - box.left + 1
      const edges = [box.top === 0 && 'top', box.right === rows[0].length - 1 && 'right', box.bottom === rows.length - 1 && 'bottom', box.left === 0 && 'left']
      return { name: cell, row: box.top + 1, column: box.left + 1, rows: box.bottom - box.top + 1, columns, textColumns: manifest.textColumns[cell] ?? columns, edges: edges.filter((edge) => edge !== false) }
    }),
  )
  const tracks = manifest.rows && !manifest.rows.includes('(') ? manifest.rows.split(/\s+/).length : undefined
  if (tracks !== undefined && tracks !== rows.length) {
    const message = `rows: ${tracks} ${tracks === 1 ? 'height' : 'heights'} for ${rows.length} rows of the layout map${tracks < rows.length ? '; the other rows are auto' : ''}`
    diagnostics.push({ severity: 'warning', message, file })
  }
  const order = manifest.order ?? []
  for (const cell of order) if (!bounds.has(cell)) diagnostics.push({ severity: 'warning', message: `order: there is no box "${cell}" in the layout map`, file })
  const areas = [
    ...order.flatMap((cell) => byPosition.filter((area) => area.name === cell)),
    ...byPosition.filter((area) => !order.includes(area.name)),
  ]

  const css = [
    '[data-poster-grid] {',
    '  display: grid;',
    `  grid-template-areas: ${rows.map((row) => `"${row.join(' ')}"`).join(' ')};`,
    `  grid-template-columns: ${manifest.columns ?? `repeat(${rows[0].length}, minmax(0, 1fr))`};`,
    `  grid-template-rows: ${manifest.rows ?? `repeat(${rows.length}, auto)`};`,
    '}',
    ...areas.map((area) => `[data-poster-grid] > [data-area="${area.name}"] { grid-area: ${area.name};${area.textColumns > 1 ? ` column-count: ${area.textColumns};` : ''} }`),
  ].join('\n')
  return { layout: { areas, css }, diagnostics }
}

/**
 * The order in which a poster is read: in horizontal bands from top to bottom, and within a band column by column.
 * A band ends at a row line that no box crosses, so full-width boxes below the columns come after them.
 */
function readingOrder(areas: Area[]) {
  const crossed = (line: number) => areas.some((area) => area.row <= line && area.row + area.rows - 1 > line)
  const band = (area: Area) => Array.from({ length: area.row - 1 }, (_, i) => i + 1).filter((line) => !crossed(line)).length
  return areas.toSorted((a, b) => band(a) - band(b) || a.column - b.column || a.row - b.row)
}
