// Keeps what was read from a source until it changes: the preview rebuilds after every edit and should not load
// all files again (pictures from the dev server in particular). Changes made elsewhere are dropped from the cache by forget().
import { type PosterSource, typed } from './source.ts'

export type CachedSource = PosterSource & { forget(paths: string[]): void }

export function cached(source: PosterSource): CachedSource {
  let list: Promise<string[]> | undefined
  const files = new Map<string, Promise<Blob | undefined>>()
  return {
    ...source,
    list: () => (list ??= source.list()),
    read(path) {
      let file = files.get(path)
      if (!file) files.set(path, (file = source.read(path)))
      return file
    },
    async write(path, data) {
      await source.write(path, data)
      files.set(path, Promise.resolve(typed(path, data)))
      list = undefined
    },
    async remove(path) {
      await source.remove(path)
      files.delete(path)
      list = undefined
    },
    forget(paths) {
      for (const path of paths) files.delete(path)
      list = undefined
    },
  }
}
