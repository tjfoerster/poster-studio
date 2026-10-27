// The poster folders served by `npm run dev` (see vite-posters.ts): examples/, posters/ and the folder in $POSTERS.
import type { PosterSource } from './source.ts'

export type DevPoster = { id: string; name: string; group: string }

/** The poster folders on this computer; empty in the built editor, which has no server. */
export async function listDevPosters(): Promise<DevPoster[]> {
  if (!import.meta.env.DEV) return []
  return (await fetch('/__posters')).json()
}

export function devPoster({ id, name, group }: DevPoster): PosterSource {
  const file = (path: string) => `/__posters/file?poster=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`
  const ok = (response: Response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return response
  }
  return {
    name,
    place: `Folder ${group}/${name} on this computer`,
    list: async () => (await fetch(`/__posters/files?poster=${encodeURIComponent(id)}`).then(ok)).json(),
    async read(path) {
      const response = await fetch(file(path))
      return response.ok ? response.blob() : undefined
    },
    write: async (path, data) => void ok(await fetch(file(path), { method: 'PUT', body: data })),
    remove: async (path) => void ok(await fetch(file(path), { method: 'DELETE' })),
    watch(onChange) {
      const listener = (data: { poster: string; path: string }) => data.poster === id && onChange([data.path])
      import.meta.hot?.on('posters:change', listener)
      return () => import.meta.hot?.off('posters:change', listener)
    },
  }
}
