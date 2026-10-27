// Posters stored in this browser (IndexedDB): for the hosted editor, in every browser. Only on this device; export a ZIP to keep a copy.
import { type Project, projectFiles, store } from './database.ts'
import { type PosterSource, typed } from './source.ts'

export const listProjects = async () => (await store('projects', 'readonly', (projects) => projects.getAll() as IDBRequest<Project[]>)).sort((a, b) => b.modified - a.modified)

export const getProject = (id: string) => store('projects', 'readonly', (projects) => projects.get(id) as IDBRequest<Project | undefined>)

export async function createProject(name: string, files: Map<string, Blob>) {
  const project: Project = { id: crypto.randomUUID(), name, modified: Date.now() }
  await store('projects', 'readwrite', (projects) => projects.put(project))
  for (const [path, blob] of files) await store('files', 'readwrite', (store) => store.put(typed(path, blob), [project.id, path]))
  void navigator.storage?.persist?.() // ask the browser not to delete the data when space runs low
  return project
}

export async function deleteProject(id: string) {
  await store('files', 'readwrite', (files) => files.delete(projectFiles(id)))
  await store('projects', 'readwrite', (projects) => projects.delete(id))
}

export function browserPoster(project: Project): PosterSource {
  const touch = () => store('projects', 'readwrite', (projects) => projects.put({ ...project, modified: Date.now() }))
  return {
    name: project.name,
    place: 'Stored in this browser',
    list: async () => (await store('files', 'readonly', (files) => files.getAllKeys(projectFiles(project.id)))).map((key) => (key as [string, string])[1]),
    read: (path) => store('files', 'readonly', (files) => files.get([project.id, path]) as IDBRequest<Blob | undefined>),
    async write(path, data) {
      await store('files', 'readwrite', (files) => files.put(typed(path, data), [project.id, path]))
      await touch()
    },
    async remove(path) {
      await store('files', 'readwrite', (files) => files.delete([project.id, path]))
      await touch()
    },
  }
}
