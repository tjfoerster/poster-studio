// Reads poster.yaml: template, language, variants, setting overrides and the layout map.
import { isMap, isScalar, LineCounter, parseDocument, type Scalar } from 'yaml'
import type { Diagnostic } from './types.ts'

export type Manifest = {
  template: string
  lang: string
  /** Classes the template defines, put on <html> as variant-<name>. */
  variants: string[]
  /** Overrides of the template's custom properties, e.g. { '--font-size': '30pt' }. */
  settings: Record<string, string>
  layout: string
  /** Line of poster.yaml that holds the first line of the layout map. */
  layoutLine: number
  rows?: string
  columns?: string
  textColumns: Record<string, number>
  order?: string[]
}

const file = 'poster.yaml'
const keys = ['template', 'lang', 'variant', 'settings', 'layout', 'rows', 'columns', 'text-columns', 'order']
const name = /^[a-zA-Z][\w-]*$/
const cssValue = /^[^;{}<>\\]+$/ // a value must not end the CSS rule or the <style> element it is written into

export function readManifest(source: string): { manifest?: Manifest; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const lines = new LineCounter()
  const document = parseDocument(source, { lineCounter: lines })
  for (const error of document.errors) {
    diagnostics.push({ severity: 'error', message: error.message.split('\n')[0], file, line: error.linePos?.[0].line })
  }
  if (document.errors.length) return { diagnostics }

  const root = document.contents
  if (!isMap(root)) {
    diagnostics.push({ severity: 'error', message: 'poster.yaml must contain lines like "layout: …" (see the example poster)', file, line: 1 })
    return { diagnostics }
  }
  const pairs = new Map(root.items.flatMap((pair) => (isScalar(pair.key) ? [[String(pair.key.value), pair] as const] : [])))
  const lineOf = (key: string) => {
    const offset = (pairs.get(key)?.key as Scalar | undefined)?.range?.[0]
    return offset === undefined ? undefined : lines.linePos(offset).line
  }
  const problem = (key: string, message: string, severity: Diagnostic['severity'] = 'error') =>
    diagnostics.push({ severity, message, file, line: lineOf(key) })
  const data = root.toJS(document) as Record<string, unknown>

  for (const key of pairs.keys()) {
    if (!keys.includes(key)) problem(key, `Unknown entry "${key}". Possible entries: ${keys.join(', ')}`, 'warning')
  }

  const single = (key: string, fallback?: string) => {
    const value = data[key]
    if (value === undefined || value === null) return fallback
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
    problem(key, `"${key}" must be a single value`)
    return fallback
  }

  const lang = single('lang', 'en')!
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(lang)) problem('lang', `"${lang}" is not a language code like en or de`)

  const variant = data.variant
  const variants = variant === undefined || variant === null ? [] : Array.isArray(variant) ? variant.map(String) : [String(variant)]
  for (const value of variants) if (!name.test(value)) problem('variant', `"${value}" is not a valid variant name`)

  const settings: Record<string, string> = {}
  if (data.settings !== undefined && data.settings !== null) {
    if (typeof data.settings !== 'object' || Array.isArray(data.settings)) problem('settings', '"settings" must list one "name: value" per line')
    else {
      for (const [key, value] of Object.entries(data.settings)) {
        const property = key.replace(/^-*/, '--')
        if (!name.test(key.replace(/^-*/, '')) || !cssValue.test(String(value))) problem('settings', `Setting "${key}: ${value}" is not valid`)
        else settings[property] = String(value).trim()
      }
    }
  }

  // The map must keep its line breaks: "layout: |" does, a plain or folded (">") value joins the lines
  const layoutNode = pairs.get('layout')?.value
  let layout = ''
  let layoutLine = 1
  if (!isScalar(layoutNode) || typeof layoutNode.value !== 'string' && typeof layoutNode.value !== 'number') {
    diagnostics.push({ severity: 'error', message: 'poster.yaml needs a layout, for example "layout: |" followed by the rows of the map', file, line: lineOf('layout') ?? 1 })
  } else {
    layout = String(layoutNode.value)
    const start = lines.linePos(layoutNode.range![0]).line
    const end = lines.linePos(layoutNode.range![1]).line
    if (layoutNode.type === 'BLOCK_LITERAL') layoutLine = start + 1
    else if (end > start || layoutNode.type === 'BLOCK_FOLDED') problem('layout', 'Write "layout: |" (with a vertical bar) so that every row of the map stays on its own line')
    else layoutLine = start
  }

  const track = (key: string) => {
    const value = single(key)
    if (value !== undefined && !cssValue.test(value)) problem(key, `"${key}: ${value}" is not valid`)
    return value
  }
  const rows = track('rows')
  const columns = track('columns')

  const textColumns: Record<string, number> = {}
  const columnsData = data['text-columns']
  if (columnsData !== undefined && columnsData !== null) {
    if (typeof columnsData !== 'object' || Array.isArray(columnsData)) problem('text-columns', '"text-columns" must list one "area: number" per line')
    else {
      for (const [area, count] of Object.entries(columnsData)) {
        if (Number.isInteger(count) && Number(count) >= 1 && Number(count) <= 6) textColumns[area] = Number(count)
        else problem('text-columns', `"${area}: ${count}" must be a whole number from 1 to 6`)
      }
    }
  }

  let order: string[] | undefined
  if (data.order !== undefined && data.order !== null) {
    if (Array.isArray(data.order)) order = data.order.map(String)
    else problem('order', '"order" must be a list, for example [background, methods, results]')
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics }
  const template = single('template', 'template.html')!
  return { manifest: { template, lang, variants, settings, layout, layoutLine, rows, columns, textColumns, order }, diagnostics }
}
