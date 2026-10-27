// The editor's IndexedDB database: posters stored in the browser (projects, files), recently opened folders and
// template files the user added.

export type Project = { id: string; name: string; modified: number }
export type RecentFolder = { name: string; handle: FileSystemDirectoryHandle; opened: number }
export type StoredTemplate = { id: string; file: Blob; added: number }

let opening: Promise<IDBDatabase> | undefined

function database() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('poster-studio', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' })
      request.result.createObjectStore('files') // key: [project id, path]
      request.result.createObjectStore('folders', { keyPath: 'name' })
      request.result.createObjectStore('templates', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/** Runs a request against one store; mode "readwrite" for changes. */
export async function store<T>(name: string, mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>) {
  return done(use((await database()).transaction(name, mode).objectStore(name)))
}

/** All keys of the files store that belong to a project. */
export const projectFiles = (id: string) => IDBKeyRange.bound([id, ''], [id, '￿'])
