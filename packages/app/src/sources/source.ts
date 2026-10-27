// Where a poster's files live: a folder served by `npm run dev`, a folder opened in Chrome or Edge, the browser's storage,
// or memory (the example poster).
// All of them look the same to the editor.
import type { PosterFiles } from '@poster-studio/engine'

export type PosterSource = PosterFiles & {
  /** The poster's name, shown in the title bar. */
  name: string
  /** Where the files are, in words: "Folder on this computer", "Stored in this browser". */
  place: string
  /** Changes are not kept (the example poster). */
  temporary?: boolean
  write(path: string, data: Blob | string): Promise<void>
  remove(path: string): Promise<void>
  /** Calls onChange with the paths of files changed outside the editor; returns a function that stops watching. */
  watch?(onChange: (paths: string[]) => void): () => void
}

const types: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  csv: 'text/csv',
  md: 'text/markdown',
  yaml: 'text/yaml',
  html: 'text/html',
  woff2: 'font/woff2',
}

/** The media type for a file name; pictures need it to show up from a blob: URL (SVG in particular). */
const typeOf = (path: string) => types[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'

/** A file's content with the media type of its name. */
export const typed = (path: string, data: Blob | string) => new Blob([data], { type: typeOf(path) })

/** Files that are edited as text in the editor. */
export const isText = (path: string) => /\.(md|ya?ml|html|csv|txt)$/i.test(path)
