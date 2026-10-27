// CSV files for ::table and ::chart: reading them, and turning them into a Mermaid chart for Pele.

/** Minimal CSV reader: comma, semicolon (German Excel) or tab separated, quoted fields, Excel's UTF-8 marker. */
export function parseCsv(text: string) {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0]
  const separator = [',', ';', '\t'].reduce((best, char) => (firstLine.split(char).length > firstLine.split(best).length ? char : best))
  const rows: string[][] = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') field += text[++i]
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') {
      quoted = true
    } else if (char === separator || char === '\n') {
      rows.at(-1)!.push(field.trim())
      field = ''
      if (char === '\n') rows.push([])
    } else if (char !== '\r') {
      field += char
    }
  }
  rows.at(-1)!.push(field.trim())
  return rows.filter((row) => row.some(Boolean))
}

type ChartOptions = { type?: string; y?: string; horizontal?: boolean }

/** Mermaid source for a chart: first column = labels, every further column = one series (its heading in the legend). */
export function chartSource(rows: string[][], { type = 'bar', y, horizontal }: ChartOptions) {
  const [head = [], ...body] = rows
  const quote = (text: string) => `"${text.replaceAll('"', "'")}"`
  const number = (cell = '') => Number(cell.replace(',', '.')) // accepts German decimal commas
  const lines =
    type === 'pie'
      ? ['pie', ...body.map(([label, value]) => `  ${quote(label)} : ${number(value)}`)]
      : [
          horizontal ? 'xychart horizontal' : 'xychart',
          `  x-axis ${quote(head[0] ?? '')} [${body.map((row) => quote(row[0])).join(', ')}]`,
          ...(y ? [`  y-axis ${quote(y)}`] : []),
          ...head.slice(1).map((name, i) => `  ${type} ${quote(name)} [${body.map((row) => number(row[i + 1])).join(', ')}]`),
        ]
  return lines.join('\n')
}
