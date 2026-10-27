// A poster folder on disk as PosterFiles, for tests.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { PosterFiles } from '../src/types.ts'

export function folderFiles(folder: string, overrides: Record<string, string | undefined> = {}): PosterFiles {
  const paths = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split('\\').join('/'))
  const all = new Set([...paths, ...Object.keys(overrides)])
  for (const [path, text] of Object.entries(overrides)) if (text === undefined) all.delete(path)
  return {
    list: async () => [...all],
    read: async (path) => {
      if (!all.has(path)) return undefined
      const text = overrides[path]
      return new Blob([text ?? readFileSync(join(folder, path))])
    },
  }
}
