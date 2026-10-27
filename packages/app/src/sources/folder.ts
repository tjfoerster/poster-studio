// A folder on this computer, opened in Chrome or Edge (File System Access API). The editor reads and writes the files
// directly, so the same folder can be under Git and edited in VS Code or by an AI assistant at the same time:
// changes made there are noticed by checking the files every second.
import { type RecentFolder, store } from './database.ts'
import type { PosterSource } from './source.ts'

type Permission = { mode: 'read' | 'readwrite' }
type Handle = FileSystemDirectoryHandle & {
  queryPermission(options: Permission): Promise<PermissionState>
  requestPermission(options: Permission): Promise<PermissionState>
}
declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  }
}

export const canOpenFolders = () => typeof window.showDirectoryPicker === 'function'

/** Asks for a folder; undefined if the user cancels. */
export async function pickFolder() {
  try {
    const handle = await window.showDirectoryPicker!({ id: 'poster', mode: 'readwrite' })
    await store('folders', 'readwrite', (folders) => folders.put({ name: handle.name, handle, opened: Date.now() } satisfies RecentFolder))
    return handle
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return undefined
    throw error
  }
}

export const recentFolders = async () => (await store('folders', 'readonly', (folders) => folders.getAll() as IDBRequest<RecentFolder[]>)).sort((a, b) => b.opened - a.opened)

export const forgetFolder = (name: string) => store('folders', 'readwrite', (folders) => folders.delete(name))

/** Asks again for access to a folder opened before (the browser forgets it between visits); needs a click. */
export async function reopenFolder(folder: RecentFolder) {
  const handle = folder.handle as Handle
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return undefined
  await store('folders', 'readwrite', (folders) => folders.put({ ...folder, opened: Date.now() }))
  return handle
}

/** Every file in the folder: path → last change and size; hidden files and node_modules are skipped. */
async function scan(folder: FileSystemDirectoryHandle, prefix = '', files = new Map<string, string>()) {
  for await (const [name, entry] of folder.entries()) {
    if (name.startsWith('.') || name === 'node_modules') continue
    if (entry.kind === 'directory') await scan(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, files)
    else {
      const file = await (entry as FileSystemFileHandle).getFile()
      files.set(prefix + name, `${file.lastModified}:${file.size}`)
    }
  }
  return files
}

async function locate(root: FileSystemDirectoryHandle, path: string, create = false) {
  const parts = path.split('/')
  let folder = root
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create })
  return { folder, name: parts.at(-1)! }
}

export function folderPoster(root: FileSystemDirectoryHandle): PosterSource {
  return {
    name: root.name,
    place: 'Folder on this computer',
    list: async () => [...(await scan(root)).keys()],
    async read(path) {
      try {
        const { folder, name } = await locate(root, path)
        return await (await folder.getFileHandle(name)).getFile()
      } catch {
        return undefined
      }
    },
    async write(path, data) {
      const { folder, name } = await locate(root, path, true)
      const writable = await (await folder.getFileHandle(name, { create: true })).createWritable()
      await writable.write(data)
      await writable.close()
    },
    async remove(path) {
      const { folder, name } = await locate(root, path)
      await folder.removeEntry(name)
    },
    watch(onChange) {
      let known: Map<string, string> | undefined
      let stopped = false
      const check = async () => {
        const files = await scan(root).catch(() => undefined)
        if (stopped) return
        if (files && known) {
          const changed = [...new Set([...files.keys(), ...known.keys()])].filter((path) => files.get(path) !== known!.get(path))
          if (changed.length) onChange(changed)
        }
        known = files ?? known
        setTimeout(check, 1000)
      }
      void check()
      return () => void (stopped = true)
    },
  }
}
