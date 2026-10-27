// The example poster (bundled by vite-posters.ts): shown at the start of a session, and what a new poster starts from,
// with a template of the user's choice.
import type { PosterFiles } from '@poster-studio/engine'
import { starter, starterTemplate } from 'virtual:bundled'

const fetchFile = async (path: string) => {
  const response = await fetch(`${import.meta.env.BASE_URL}${encodeURI(path)}`)
  if (!response.ok) throw new Error(`Could not load ${path}`)
  return response.blob()
}

/** The example poster's files, with its own template. */
export async function fetchStarter() {
  const files = new Map<string, Blob>()
  await Promise.all(starter.map(async (path) => files.set(path, await fetchFile(`starter/${path}`))))
  if (starterTemplate) files.set('template.html', await fetchFile(`templates/${starterTemplate}.html`))
  return files
}

/** The example poster with another template: the start of a new poster. */
export async function starterFiles(template: Blob) {
  const files = await fetchStarter()
  files.set('template.html', template)
  return files
}

/** Files in memory, as the engine reads them. */
export const memoryFiles = (files: Map<string, Blob>): PosterFiles => ({ list: async () => [...files.keys()], read: async (path) => files.get(path) })
