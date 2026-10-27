// The editor: the poster's files on the left, the open file in the middle, the preview on the right; problems below the
// file. Edit, Split and Preview switch between writing and looking. Edits are saved shortly after typing stops; changes
// made outside (VS Code, an AI assistant, Git) appear as soon as the source notices them.
import type { Diagnostic } from '@poster-studio/engine'
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Columns2,
  Download,
  Eye,
  File,
  FileText,
  Image,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Save,
  Settings2,
  Sheet,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide'
import type { IconNode } from 'lucide'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { CodeEditor } from './CodeEditor.tsx'
import { Icon } from './Icon.tsx'
import { Preview } from './Preview.tsx'
import { browserPoster, createProject } from './sources/browser.ts'
import { cached } from './sources/cached.ts'
import { isText, type PosterSource, typed } from './sources/source.ts'
import { listTemplates, originLabel, type Template, templateTitle } from './sources/templates.ts'
import { zipPoster } from './sources/zip.ts'

type Props = { source: PosterSource; onClose(): void; onOpen(source: PosterSource, hash?: string): void }
type View = 'edit' | 'split' | 'preview'

const first = ['poster.yaml', 'header.md', 'footer.md', 'template.html']
const order = (a: string, b: string) => (first.indexOf(a) + 1 || 99) - (first.indexOf(b) + 1 || 99) || a.localeCompare(b)
const picture = /\.(svg|png|jpe?g|gif|webp|avif)$/i

const iconOf = (path: string): IconNode =>
  path === 'poster.yaml' ? Settings2 : path.endsWith('.html') ? LayoutTemplate : path.endsWith('.md') ? FileText : path.endsWith('.csv') ? Sheet : picture.test(path) ? Image : File

/** A remembered choice of the user (layout of the editor), kept in this browser. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`poster-studio:${key}`)
      return stored === null ? initial : (JSON.parse(stored) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(`poster-studio:${key}`, JSON.stringify(value))
    } catch {}
  }, [value])
  return [value, setValue] as const
}

function download(blob: Blob, name: string) {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

/** A one-line input that commits on Enter and gives up on Escape or when it loses focus. */
function InlineInput({ value = '', placeholder, onCommit, onCancel }: { value?: string; placeholder?: string; onCommit(value: string): void; onCancel(): void }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <input
      ref={input}
      class="inline-input"
      value={value}
      placeholder={placeholder}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit((event.target as HTMLInputElement).value.trim())
        if (event.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
    />
  )
}

export function Editor({ source: raw, onClose, onOpen }: Props) {
  const source = useMemo(() => cached(raw), [raw])
  const [paths, setPaths] = useState<string[]>([])
  const [open, setOpen] = useState<string>()
  const [buffer, setBuffer] = useState({ text: '', revision: 0 })
  const [pictureUrl, setPictureUrl] = useState<string>()
  const [goto, setGoto] = useState<{ line: number }>()
  const [version, setVersion] = useState(0)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')
  const [templates, setTemplates] = useState<{ template: Template; title: string }[]>([])
  const [keeping, setKeeping] = useState(false)
  const [view, setView] = useStored<View>('view', 'split')
  const [sidebar, setSidebar] = useStored('sidebar', true)
  const [editorWidth, setEditorWidth] = useStored('editor-width', 0.42)
  const [problemsOpen, setProblemsOpen] = useStored('problems', true)
  const opened = useRef<string | undefined>(undefined)
  const saved = useRef('') // the open file as last read or written
  const pending = useRef<{ path: string; text: string; timer: ReturnType<typeof setTimeout> } | undefined>(undefined)
  const printer = useRef<(() => void) | undefined>(undefined)
  const upload = useRef<HTMLInputElement>(null)
  const templateFile = useRef<HTMLInputElement>(null)
  const layout = useRef<HTMLDivElement>(null)

  const rebuild = () => setVersion((version) => version + 1)
  const refresh = async () => {
    const list = (await source.list()).sort(order)
    setPaths(list)
    return list
  }

  const save = async (path: string, text: string) => {
    await source.write(path, text)
    if (path === opened.current) saved.current = text
    if (!pending.current) setSaving(false)
    rebuild()
  }
  const flush = async () => {
    const edit = pending.current
    if (!edit) return
    clearTimeout(edit.timer)
    pending.current = undefined
    await save(edit.path, edit.text)
  }
  const onEdit = (text: string) => {
    const path = opened.current!
    if (pending.current) clearTimeout(pending.current.timer)
    const timer = setTimeout(() => {
      pending.current = undefined
      void save(path, text)
    }, 400)
    pending.current = { path, text, timer }
    setSaving(true)
  }

  const load = async (path: string) => {
    const text = (await (await source.read(path))?.text()) ?? ''
    saved.current = text
    setBuffer((buffer) => ({ text, revision: buffer.revision + 1 }))
  }
  /** Opens a file in the middle; reveal switches from Preview to Split so that it can be seen. */
  const openFile = async (path: string, line?: number, reveal = true) => {
    await flush()
    opened.current = path
    setOpen(path)
    setConflict(false)
    setRenaming(false)
    setDeleting(false)
    if (pictureUrl) URL.revokeObjectURL(pictureUrl)
    if (isText(path)) {
      setPictureUrl(undefined)
      await load(path)
      if (line) setGoto({ line })
    } else {
      const blob = await source.read(path)
      setPictureUrl(blob && picture.test(path) ? URL.createObjectURL(typed(path, blob)) : undefined)
    }
    if (reveal && view === 'preview') setView('split')
  }

  useEffect(() => {
    void refresh().then((list) => openFile(list.includes('header.md') ? 'header.md' : 'poster.yaml', undefined, false))
    const stop = source.watch?.(async (changed) => {
      source.forget(changed)
      await refresh()
      const path = opened.current
      if (path && changed.includes(path) && isText(path)) {
        const text = (await (await source.read(path))?.text()) ?? ''
        if (text !== saved.current && text !== pending.current?.text) {
          if (pending.current) setConflict(true)
          else {
            saved.current = text
            setBuffer((buffer) => ({ text, revision: buffer.revision + 1 }))
          }
        }
      }
      rebuild()
    })
    return () => {
      stop?.()
      void flush()
    }
  }, [source])

  const newBox = async (name: string) => {
    setAdding(false)
    if (!name) return
    if (!/^[a-zA-Z][\w-]*$/.test(name)) return setNotice('A box name uses letters, digits and "-", and starts with a letter.')
    const path = `sections/${name}.md`
    if (!paths.includes(path)) await source.write(path, `## ${name[0].toUpperCase()}${name.slice(1).replaceAll('-', ' ')}\n\n`)
    setNotice(`Add "${name}" to the layout map in poster.yaml to place the new box.`)
    await refresh()
    await openFile(path)
    rebuild()
  }
  const addFiles = async (files: Iterable<File>) => {
    for (const file of files) await source.write(`resources/${file.name}`, file)
    await refresh()
    rebuild()
  }
  const rename = async (to: string) => {
    setRenaming(false)
    const from = open!
    if (!to || to === from) return
    if (paths.includes(to)) return setNotice(`${to} exists already.`)
    await flush()
    const blob = await source.read(from)
    if (!blob) return
    await source.write(to, blob)
    await source.remove(from)
    await refresh()
    await openFile(to)
    rebuild()
  }
  const remove = async () => {
    setDeleting(false)
    if (!open) return
    if (pending.current?.path === open) {
      clearTimeout(pending.current.timer)
      pending.current = undefined
      setSaving(false)
    }
    await source.remove(open)
    opened.current = undefined
    setOpen(undefined)
    await refresh()
    rebuild()
  }
  /** The templates this poster could switch to, offered while template.html is open. */
  useEffect(() => {
    if (open !== 'template.html') return
    void listTemplates().then(async (list) => setTemplates(await Promise.all(list.map(async (template) => ({ template, title: templateTitle(await (await template.load()).text()) ?? template.name })))))
  }, [open])
  const applyTemplate = async (file: Blob, name: string) => {
    if (!(await file.text()).includes('<slot name="sections"')) return setNotice(`${name} is not a poster template (it has no <slot name="sections">).`)
    await flush()
    await source.write('template.html', file)
    await openFile('template.html', undefined, false)
    setNotice(`The poster now uses ${name}.`)
    rebuild()
  }

  const resolveConflict = async (keepMine: boolean) => {
    setConflict(false)
    if (keepMine) return flush()
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = undefined
    setSaving(false)
    await load(opened.current!)
  }

  /** Stores the example poster, as it is now, in the browser under a name of the user's choice, and opens that copy. */
  const keep = async (name: string) => {
    setKeeping(false)
    if (!name) return
    await flush()
    const files = new Map<string, Blob>()
    for (const path of await source.list()) {
      const blob = await source.read(path)
      if (blob) files.set(path, blob)
    }
    const project = await createProject(name, files)
    onOpen(browserPoster(project), `browser/${project.id}`)
  }

  /** Drags the divider between the file and the preview. */
  const resize = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement
    const bounds = layout.current!.getBoundingClientRect()
    const left = sidebar ? 248 : 0
    handle.setPointerCapture(event.pointerId)
    const move = (moving: PointerEvent) => setEditorWidth(Math.min(0.75, Math.max(0.2, (moving.clientX - bounds.left - left) / (bounds.width - left))))
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
  const warnings = diagnostics.length - errors
  const showProblems = () => {
    setProblemsOpen(true)
    if (view === 'preview') setView('split')
  }
  const groups = [
    { id: 'poster', title: 'Meta Informations', files: paths.filter((path) => !path.includes('/')) },
    { id: 'boxes', title: 'Content Boxes', add: () => setAdding(true), addLabel: 'New box', files: paths.filter((path) => path.startsWith('sections/')) },
    { id: 'resources', title: 'Resources', add: () => upload.current?.click(), addLabel: 'Add files', files: paths.filter((path) => path.startsWith('resources/')) },
    { id: 'other', title: 'Other files', files: paths.filter((path) => path.includes('/') && !/^(sections|resources)\//.test(path)) },
  ]

  return (
    <div class={`editor view-${view}${sidebar ? '' : ' no-sidebar'}`} ref={layout} style={{ '--editor-width': String(editorWidth) }}>
      <header class="topbar">
        <button
          class="ghost icon-only"
          title="All posters"
          onClick={async () => {
            await flush()
            onClose()
          }}
        >
          <Icon icon={ArrowLeft} />
        </button>
        {!sidebar && view !== 'preview' && (
          <button class="ghost icon-only" title="Show files" onClick={() => setSidebar(true)}>
            <Icon icon={PanelLeftOpen} />
          </button>
        )}
        <div class="title">
          <h1>{source.name}</h1>
          <span>{source.place}</span>
        </div>
        <div class="segmented" role="group" aria-label="View">
          {(
            [
              ['edit', PenLine, 'Edit'],
              ['split', Columns2, 'Split'],
              ['preview', Eye, 'Preview'],
            ] as const
          ).map(([value, icon, label]) => (
            <button key={value} class={view === value ? 'on' : undefined} onClick={() => setView(value)} aria-pressed={view === value}>
              <Icon icon={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div class="actions">
          {raw.temporary &&
            (keeping ? (
              <span class="keep">
                <InlineInput value="my-poster" onCommit={keep} onCancel={() => setKeeping(false)} />
              </span>
            ) : (
              <button onClick={() => setKeeping(true)} title="Store this poster in the browser, as it is now, and continue with it as your own">
                <Icon icon={Save} />
                <span>Keep as my poster</span>
              </button>
            ))}
          <button class={errors ? 'badge error' : warnings ? 'badge warning' : 'badge ok'} onClick={showProblems} title="Problems">
            <Icon icon={errors ? CircleAlert : warnings ? TriangleAlert : CircleCheck} />
            {errors ? `${errors} ${errors === 1 ? 'problem' : 'problems'}` : warnings ? `${warnings} ${warnings === 1 ? 'note' : 'notes'}` : 'No problems'}
          </button>
          <button
            title="Download the poster folder as one ZIP file"
            onClick={async () => {
              await flush()
              download(await zipPoster(source), `${source.name}.zip`)
            }}
          >
            <Icon icon={Download} />
            <span>ZIP</span>
          </button>
          <button class="primary" onClick={() => printer.current?.()} title="Ctrl/⌘ + P; choose “Save as PDF” as the printer">
            <Icon icon={Printer} />
            <span>Print / PDF</span>
          </button>
        </div>
      </header>

      <nav
        class={dropping ? 'files dropping' : 'files'}
        aria-label="Files"
        onDragOver={(event) => {
          event.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDropping(false)
          void addFiles(event.dataTransfer?.files ?? [])
        }}
      >
        <div class="files-head">
          <span>Files</span>
          <button class="ghost icon-only" title="Hide files" onClick={() => setSidebar(false)}>
            <Icon icon={PanelLeftClose} />
          </button>
        </div>
        {groups.map(({ id, title, files, add, addLabel }) =>
          files.length === 0 && !add ? null : (
            <section key={id}>
              <h2>
                {title}
                {add && (
                  <button class="ghost icon-only small" title={addLabel} onClick={add}>
                    <Icon icon={id === 'resources' ? Upload : Plus} size={14} />
                  </button>
                )}
              </h2>
              <ul>
                {files.map((path) => (
                  <li key={path}>
                    <button class={path === open ? 'file open' : 'file'} onClick={() => openFile(path)} title={path}>
                      <Icon icon={iconOf(path)} size={15} />
                      <span>{path.replace(/^(sections|resources)\//, '')}</span>
                    </button>
                  </li>
                ))}
                {id === 'boxes' && adding && (
                  <li>
                    <InlineInput placeholder="name, e.g. aims" onCommit={newBox} onCancel={() => setAdding(false)} />
                  </li>
                )}
              </ul>
            </section>
          ),
        )}
        <input ref={upload} type="file" multiple hidden onChange={(event) => addFiles((event.target as HTMLInputElement).files ?? [])} />
        <p class="hint">Drop pictures and tables here to add them to resources/.</p>
      </nav>

      <main class="file-view">
        <div class="file-head">
          {open && <Icon icon={iconOf(open)} size={15} />}
          {open && renaming ? (
            <InlineInput value={open} onCommit={rename} onCancel={() => setRenaming(false)} />
          ) : (
            <span class="path">{open ?? 'No file open'}</span>
          )}
          {open && isText(open) && <span class="save-state">{saving ? 'Saving…' : 'Saved'}</span>}
          {open === 'template.html' && !renaming && (
            <select
              class="template-choice"
              value=""
              title="Use another template for this poster"
              onChange={(event) => {
                const select = event.target as HTMLSelectElement
                const value = select.value
                select.value = ''
                const chosen = templates[Number(value)]
                if (value === 'file') templateFile.current?.click()
                else if (chosen) void chosen.template.load().then((file) => applyTemplate(file, chosen.title))
              }}
            >
              <option value="">Use another template…</option>
              {templates.map(({ template, title }, i) => (
                <option key={i} value={i}>
                  {originLabel(template) ? `${title} (${originLabel(template).toLowerCase()})` : title}
                </option>
              ))}
              <option value="file">A template file…</option>
            </select>
          )}
          <input ref={templateFile} type="file" accept=".html,.htm" hidden onChange={(event) => {
            const file = (event.target as HTMLInputElement).files?.[0]
            if (file) void applyTemplate(file, file.name)
          }} />
          {open && !renaming && (
            <span class="file-actions">
              {deleting ? (
                <>
                  <span>Delete this file?</span>
                  <button class="danger small" onClick={remove}>
                    Delete
                  </button>
                  <button class="small" onClick={() => setDeleting(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button class="ghost icon-only" title="Rename" onClick={() => setRenaming(true)}>
                    <Icon icon={Pencil} size={15} />
                  </button>
                  <button class="ghost icon-only" title="Delete" onClick={() => setDeleting(true)}>
                    <Icon icon={Trash2} size={15} />
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        {notice && (
          <div class="notice">
            <span>{notice}</span>
            <button class="ghost icon-only small" title="Close" onClick={() => setNotice('')}>
              <Icon icon={X} size={14} />
            </button>
          </div>
        )}
        {conflict && (
          <div class="notice warning">
            <span>{open} was changed outside the editor while you were typing.</span>
            <button class="small" onClick={() => resolveConflict(false)}>
              Load the other version
            </button>
            <button class="small" onClick={() => resolveConflict(true)}>
              Keep mine
            </button>
          </div>
        )}
        <div class="file-body">
          {open && isText(open) && <CodeEditor path={open} text={buffer.text} revision={buffer.revision} goto={goto} onChange={onEdit} />}
          {open && !isText(open) && (
            <div class="picture">{pictureUrl ? <img src={pictureUrl} alt={open} /> : <p class="hint">This file is not shown here; the poster can refer to it.</p>}</div>
          )}
        </div>
        <section class={problemsOpen ? 'problems' : 'problems closed'} aria-label="Problems">
          <button class="problems-head" onClick={() => setProblemsOpen(!problemsOpen)} aria-expanded={problemsOpen}>
            <Icon icon={errors ? CircleAlert : warnings ? TriangleAlert : CircleCheck} size={15} />
            <span>{errors ? `${errors} ${errors === 1 ? 'problem' : 'problems'} to fix` : warnings ? 'Notes' : 'No problems'}</span>
            {diagnostics.length > 0 && <span class="count">{diagnostics.length}</span>}
          </button>
          {problemsOpen && diagnostics.length > 0 && (
            <ul>
              {diagnostics.map((diagnostic, i) => (
                <li key={i} class={diagnostic.severity}>
                  <Icon icon={diagnostic.severity === 'error' ? CircleAlert : TriangleAlert} size={14} />
                  <span>
                    {diagnostic.file && (
                      <button class="link" onClick={() => paths.includes(diagnostic.file!) && openFile(diagnostic.file!, diagnostic.line)}>
                        {diagnostic.file}
                        {diagnostic.line ? `:${diagnostic.line}` : ''}
                      </button>
                    )}{' '}
                    {diagnostic.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <div class="splitter" onPointerDown={resize} role="separator" aria-orientation="vertical" title="Drag to resize" />

      <Preview source={source} version={version} hidden={view === 'edit'} onDiagnostics={setDiagnostics} onOpenFile={(path) => openFile(path)} printer={printer} />
    </div>
  )
}
