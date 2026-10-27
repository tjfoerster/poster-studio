// The project ZIP: the poster folder in one file, laid out as on disk. Exported from any source, imported into the
// browser's storage. A dropped folder (Safari unpacks downloaded ZIPs on its own) is read the same way.
import { unzipSync, type Zippable, zipSync } from 'fflate'
import type { PosterSource } from './source.ts'

const compressed = /\.(png|jpe?g|gif|webp|avif|woff2?|pdf|zip|docx|pptx|xlsx)$/i // stored as they are

/** Hidden files (.git, .DS_Store), macOS extras and node_modules are no part of a poster. */
const ignored = (path: string) => path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX' || part === 'node_modules')

export async function zipPoster(source: PosterSource): Promise<Blob> {
  const files: Zippable = {}
  for (const path of await source.list()) {
    const blob = await source.read(path)
    if (blob && !ignored(path)) files[`${source.name}/${path}`] = [new Uint8Array(await blob.arrayBuffer()), { level: compressed.test(path) ? 0 : 6 }]
  }
  return new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export type Unpacked = { name?: string; files: Map<string, Blob> }

export async function unzipPoster(zip: Blob): Promise<Unpacked> {
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), { filter: (file) => !file.name.endsWith('/') && !ignored(file.name) })
  return withoutTopFolder(Object.entries(entries).map(([path, data]) => [path, new Blob([data as Uint8Array<ArrayBuffer>])]))
}

/** A folder dropped onto the page, through the drag-and-drop file entries every browser supports. */
export async function readDroppedFolder(folder: FileSystemDirectoryEntry): Promise<Unpacked> {
  const entries: [string, Blob][] = []
  const visit = async (directory: FileSystemDirectoryEntry, prefix: string) => {
    const reader = directory.createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const entry of batch) {
        const path = prefix + entry.name
        if (ignored(path)) continue
        if (entry.isDirectory) await visit(entry as FileSystemDirectoryEntry, `${path}/`)
        else entries.push([path, await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))])
      }
    }
  }
  await visit(folder, '')
  return { name: folder.name, files: new Map(entries) }
}

/** A ZIP made from a folder holds that folder: its name becomes the poster's name, its content the files. */
function withoutTopFolder(entries: [string, Blob][]): Unpacked {
  const tops = new Set(entries.map(([path]) => path.split('/')[0]))
  const top = tops.size === 1 && entries.every(([path]) => path.includes('/')) ? [...tops][0] : undefined
  return { name: top, files: new Map(entries.map(([path, blob]) => [top ? path.slice(top.length + 1) : path, blob])) }
}
