// A poster kept only in memory: the example poster, opened at the start of a browser session to try things out.
// Changes are lost when the page is reloaded; the editor offers to keep a copy in the browser.
import { type PosterSource, typed } from './source.ts'
import { fetchStarter } from './starter.ts'

function memoryPoster(name: string, files: Map<string, Blob>): PosterSource {
  return {
    name,
    place: 'Example: try anything here, changes are not kept',
    temporary: true,
    list: async () => [...files.keys()],
    read: async (path) => files.get(path),
    write: async (path, data) => void files.set(path, typed(path, data)),
    remove: async (path) => void files.delete(path),
  }
}

export const examplePoster = async () => memoryPoster('Example poster', await fetchStarter())
