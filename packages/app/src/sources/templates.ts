// The templates a poster can use: those built into the editor, those the web server offers in its templates/ folder
// (for templates that may not be published with the code, such as ones with logos), and template files the user added in
// this browser. Templates never leave the browser once they are there.
import { templates as builtIn } from 'virtual:bundled'
import { type StoredTemplate, store } from './database.ts'

/** id is unique (browser:<name> for templates added in the browser); name is the file name without .html. */
export type Template = { id: string; name: string; origin: 'editor' | 'server' | 'browser'; load(): Promise<Blob> }

const fetchTemplate = async (name: string) => {
  const response = await fetch(`${import.meta.env.BASE_URL}templates/${encodeURIComponent(name)}.html`)
  if (!response.ok) throw new Error(`Could not load the template ${name}`)
  return response.blob()
}

/** The template files on the web server: nginx lists the templates/ folder as JSON (autoindex), and so does `npm run dev`. */
async function serverTemplates() {
  try {
    const entries = (await (await fetch(`${import.meta.env.BASE_URL}templates/`)).json()) as { name: string; type: string }[]
    return entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.html')).map((entry) => entry.name.slice(0, -'.html'.length))
  } catch {
    return [] // a web server without the listing: only the built-in templates
  }
}

export async function listTemplates(): Promise<Template[]> {
  const names = [...new Set([...builtIn, ...(await serverTemplates())])]
  const stored = await store('templates', 'readonly', (templates) => templates.getAll() as IDBRequest<StoredTemplate[]>)
  return [
    ...names.map((name): Template => ({ id: name, name, origin: builtIn.includes(name) ? 'editor' : 'server', load: () => fetchTemplate(name) })),
    ...stored.sort((a, b) => a.added - b.added).map((template): Template => ({ id: `browser:${template.id}`, name: template.id, origin: 'browser', load: async () => template.file })),
  ]
}

/** Where a template comes from, in words (for templates that do not come with the editor). */
export const originLabel = (template: Template) => ({ editor: '', server: 'This website', browser: 'This browser' })[template.origin]

/** The name a template gives itself (<meta name="poster-template" content="name=…">). */
export const templateTitle = (html: string) => html.match(/<meta name="poster-template" content="name=([^;"]+)/)?.[1]

/** A template file chosen by the user; undefined (and nothing stored) if it is no poster template. */
export async function addTemplate(file: File): Promise<Template | undefined> {
  if (!(await file.text()).includes('<slot name="sections"')) return undefined
  const template: StoredTemplate = { id: file.name.replace(/\.html?$/i, ''), file, added: Date.now() }
  await store('templates', 'readwrite', (templates) => templates.put(template))
  return { id: `browser:${template.id}`, name: template.id, origin: 'browser', load: async () => file }
}

export const removeTemplate = (template: Template) => store('templates', 'readwrite', (templates) => templates.delete(template.name))
