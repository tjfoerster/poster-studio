// The start screen: start a new poster from a template, open a folder (Chrome, Edge), import a ZIP, or continue with a
// poster from before.
import { build } from '@poster-studio/engine'
import { finish } from '@poster-studio/engine/finish'
import { BookOpen, FileArchive, FilePlus, Folder, FolderOpen, HardDrive, LayoutTemplate, Monitor, Trash2, X } from 'lucide'
import type { IconNode } from 'lucide'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './Icon.tsx'
import { browserPoster, createProject, deleteProject, listProjects } from './sources/browser.ts'
import type { Project, RecentFolder } from './sources/database.ts'
import { type DevPoster, devPoster, listDevPosters } from './sources/dev.ts'
import { examplePoster } from './sources/memory.ts'
import { canOpenFolders, folderPoster, forgetFolder, pickFolder, recentFolders, reopenFolder } from './sources/folder.ts'
import { type PosterSource, typed } from './sources/source.ts'
import { fetchStarter, memoryFiles, starterFiles } from './sources/starter.ts'
import { addTemplate, listTemplates, originLabel, removeTemplate, type Template, templateTitle } from './sources/templates.ts'
import { readDroppedFolder, type Unpacked, unzipPoster } from './sources/zip.ts'

type Props = { onOpen(source: PosterSource, hash?: string): void }

type CardProps = { template: Template; starter?: Map<string, Blob>; selected: boolean; onSelect(): void; onRemove?(): void }

/** A template, shown with the example poster in it (built by the engine, like the preview). */
function TemplateCard({ template, starter, selected, onSelect, onRemove }: CardProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [title, setTitle] = useState(template.name)
  useEffect(() => {
    if (!starter) return
    const urls: string[] = []
    void (async () => {
      const file = await template.load()
      setTitle(templateTitle(await file.text()) ?? template.name)
      const files = new Map([...starter, ['template.html', file]])
      const resolveUrl = (path: string) => {
        const url = URL.createObjectURL(typed(path, files.get(path)!))
        urls.push(url)
        return url
      }
      const { html } = await build({ files: memoryFiles(files), resolveUrl })
      const element = frame.current
      if (!element) return
      element.onload = () => element.contentDocument && void finish(element.contentDocument)
      element.srcdoc = html
    })()
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [template, starter])
  const origin = originLabel(template)
  return (
    <div class="template-wrap">
      <button class={selected ? 'template on' : 'template'} onClick={onSelect} aria-pressed={selected} title={origin ? `${title} · ${origin}` : title}>
        <span class="thumb">
          <iframe ref={frame} sandbox="allow-same-origin" scrolling="no" tabIndex={-1} title={title} />
        </span>
        <span class="template-name">{title}</span>
        {origin && <span class="template-origin">{origin}</span>}
      </button>
      {onRemove && (
        <button class="ghost icon-only small remove" title="Remove this template from the browser" onClick={onRemove}>
          <Icon icon={X} size={14} />
        </button>
      )}
    </div>
  )
}

function Row({ icon, name, meta, onOpen, onRemove, removeLabel }: { icon: IconNode; name: string; meta?: string; onOpen(): void; onRemove?(): void; removeLabel?: string }) {
  return (
    <li class="row-item">
      <button class="row-main" onClick={onOpen}>
        <Icon icon={icon} />
        <span class="row-name">{name}</span>
        {meta && <span class="row-meta">{meta}</span>}
      </button>
      {onRemove && (
        <button class="ghost icon-only" title={removeLabel} onClick={onRemove}>
          <Icon icon={Trash2} size={15} />
        </button>
      )}
    </li>
  )
}

export function Start({ onOpen }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<RecentFolder[]>([])
  const [devPosters, setDevPosters] = useState<DevPoster[]>([])
  const [name, setName] = useState('my-poster')
  const [templates, setTemplates] = useState<Template[]>([])
  const [template, setTemplate] = useState<Template>()
  const [message, setMessage] = useState('')
  const [dropping, setDropping] = useState(false)
  const [starter, setStarter] = useState<Map<string, Blob>>()

  const reload = () => {
    void listProjects().then(setProjects)
    if (canOpenFolders()) void recentFolders().then(setFolders)
  }
  /** The templates; selected stays selected if still there, otherwise the first one offered by the website or added in
   *  this browser (the institute's own), otherwise the first one. */
  const loadTemplates = async (selected?: string) => {
    const list = await listTemplates()
    setTemplates(list)
    setTemplate(list.find((each) => each.id === selected) ?? list.find((each) => each.origin !== 'editor') ?? list[0])
  }
  useEffect(() => {
    reload()
    void loadTemplates()
    void listDevPosters().then(setDevPosters)
    void fetchStarter().then(setStarter)
  }, [])
  const addTemplateFile = async (file: File | undefined) => {
    if (!file) return
    const added = await addTemplate(file)
    if (!added) return setMessage(`${file.name} is not a poster template (it has no <slot name="sections">).`)
    await loadTemplates(added.id)
  }

  const openProject = (project: Project) => onOpen(browserPoster(project), `browser/${project.id}`)
  const create = async () => template && openProject(await createProject(name.trim() || 'my-poster', await starterFiles(await template.load())))
  /** The starter's files written into a folder the user picks (Chrome, Edge): a poster folder for Git from the start. */
  const createInFolder = async () => {
    const handle = template && (await pickFolder())
    if (!handle) return
    const source = folderPoster(handle)
    if ((await source.list()).includes('poster.yaml')) return setMessage(`The folder ${handle.name} already holds a poster. Open it with “Open a folder”, or choose an empty folder.`)
    for (const [path, blob] of await starterFiles(await template.load())) await source.write(path, blob)
    onOpen(source)
  }
  const importUnpacked = async ({ name, files }: Unpacked, fallback: string) => {
    if (!files.has('poster.yaml')) return setMessage(`${fallback} contains no poster.yaml, so it is not a poster folder.`)
    openProject(await createProject(name ?? fallback, files))
  }
  const importZip = async (file: File) => importUnpacked(await unzipPoster(file), file.name.replace(/\.zip$/i, ''))
  const openFolder = async (handle: FileSystemDirectoryHandle | undefined) => {
    if (!handle) return
    const source = folderPoster(handle)
    if (!(await source.list()).includes('poster.yaml')) return setMessage(`The folder ${handle.name} contains no poster.yaml. Choose a poster folder, or start a new poster in it.`)
    onOpen(source)
  }

  return (
    <div
      class={dropping ? 'start dropping' : 'start'}
      onDragOver={(event) => {
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => event.target === event.currentTarget && setDropping(false)}
      onDrop={async (event) => {
        event.preventDefault()
        setDropping(false)
        const item = event.dataTransfer?.items[0]
        const entry = item?.webkitGetAsEntry()
        if (entry?.isDirectory) await importUnpacked(await readDroppedFolder(entry as FileSystemDirectoryEntry), entry.name)
        else if (item?.getAsFile()?.name.toLowerCase().endsWith('.zip')) await importZip(item.getAsFile()!)
        else setMessage('Drop a poster folder or a ZIP file.')
      }}
    >
      <header class="start-head">
        <span class="mark">
          <Icon icon={LayoutTemplate} size={22} />
        </span>
        <div>
          <h1>Poster Studio</h1>
          <p>Write a scientific poster in simple text files, see it while you write, and save it as a PDF.</p>
        </div>
      </header>

      {message && (
        <div class="notice error" role="alert">
          <span>{message}</span>
          <button class="ghost icon-only small" title="Close" onClick={() => setMessage('')}>
            <Icon icon={X} size={14} />
          </button>
        </div>
      )}

      <section class="card">
        <h2>New poster</h2>
        <p class="hint">Starts from the example poster in the template you choose; replace its text with yours.</p>
        <div class="templates">
          {templates.map((each) => (
            <TemplateCard
              key={each.id}
              template={each}
              starter={starter}
              selected={each === template}
              onSelect={() => setTemplate(each)}
              onRemove={each.origin === 'browser' ? () => removeTemplate(each).then(() => loadTemplates(template?.id)) : undefined}
            />
          ))}
          <label class="template add" title="A template file (.html), for example from your department; it stays in this browser">
            <span class="thumb">
              <Icon icon={FilePlus} size={28} />
            </span>
            <span class="template-name">Use a template file…</span>
            <input type="file" accept=".html,.htm" hidden onChange={(event) => addTemplateFile((event.target as HTMLInputElement).files?.[0])} />
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>Name</span>
            <input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} onKeyDown={(event) => event.key === 'Enter' && create()} />
          </label>
          <button class="primary" onClick={create} title="Kept in this browser">
            Create
          </button>
          {canOpenFolders() && (
            <button onClick={createInFolder} title="Writes the poster into an empty folder on your computer, for example to keep it under Git">
              <Icon icon={Folder} />
              <span>Create in a folder…</span>
            </button>
          )}
        </div>
      </section>

      <section class="card">
        <h2>Open a poster</h2>
        <div class="row">
          <button onClick={async () => onOpen(await examplePoster(), 'example')} title="The example poster explains how the editor works">
            <Icon icon={BookOpen} />
            <span>Open the example</span>
          </button>
          {canOpenFolders() && (
            <button onClick={() => pickFolder().then(openFolder)} title="Edits are saved into the folder; it can be under Git and edited elsewhere at the same time">
              <Icon icon={FolderOpen} />
              <span>Open a folder…</span>
            </button>
          )}
          <label class="button">
            <Icon icon={FileArchive} />
            <span>Import ZIP…</span>
            <input type="file" accept=".zip" hidden onChange={(event) => (event.target as HTMLInputElement).files?.[0] && importZip((event.target as HTMLInputElement).files![0])} />
          </label>
          <span class="hint">or drop a poster folder or ZIP file onto this page</span>
        </div>
        {!canOpenFolders() && <p class="hint">To edit a folder on your computer directly, use Chrome or Edge.</p>}

        {devPosters.length > 0 && (
          <>
            <h3>On this computer</h3>
            <ul class="rows">
              {devPosters.map((poster) => (
                <Row key={poster.id} icon={Monitor} name={poster.name} meta={`${poster.group}/`} onOpen={() => onOpen(devPoster(poster), `dev/${poster.id}`)} />
              ))}
            </ul>
          </>
        )}

        {folders.length > 0 && (
          <>
            <h3>Recent folders</h3>
            <ul class="rows">
              {folders.map((folder) => (
                <Row
                  key={folder.name}
                  icon={Folder}
                  name={folder.name}
                  meta={new Date(folder.opened).toLocaleDateString()}
                  onOpen={() => reopenFolder(folder).then(openFolder)}
                  onRemove={() => forgetFolder(folder.name).then(reload)}
                  removeLabel="Remove from this list (the folder stays)"
                />
              ))}
            </ul>
          </>
        )}

        {projects.length > 0 && (
          <>
            <h3>In this browser</h3>
            <ul class="rows">
              {projects.map((project) => (
                <Row
                  key={project.id}
                  icon={HardDrive}
                  name={project.name}
                  meta={new Date(project.modified).toLocaleString()}
                  onOpen={() => openProject(project)}
                  onRemove={() => confirm(`Delete the poster ${project.name} from this browser?`) && deleteProject(project.id).then(reload)}
                  removeLabel="Delete from this browser"
                />
              ))}
            </ul>
            <p class="hint">Kept only in this browser on this device. Download a ZIP to keep a copy or to move a poster elsewhere.</p>
          </>
        )}
      </section>
    </div>
  )
}
