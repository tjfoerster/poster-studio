// The poster as it will be printed: built by the engine into a sandboxed iframe (no scripts run in it), completed by
// finish(), shown on a canvas that zooms and pans like a PDF viewer. Two iframes take turns, so the page does not flash
// while it is rebuilt. A glass pane above the poster takes the pointer: drag to pan, Ctrl/⌘ + wheel or pinch to zoom,
// click a box to open its file.
import { build, type Diagnostic } from '@poster-studio/engine'
import { finish } from '@poster-studio/engine/finish'
import { Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './Icon.tsx'
import type { CachedSource } from './sources/cached.ts'
import { typed } from './sources/source.ts'

const pictures = /\.(svg|png|jpe?g|gif|webp|avif)$/i
const pad = 32 // space around the poster on the canvas
const steps = [0.05, 0.08, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4]

type Zoom = { fit: 'width' | 'page' } | { scale: number }
type Props = {
  source: CachedSource
  version: number
  hidden?: boolean
  onDiagnostics(diagnostics: Diagnostic[]): void
  onOpenFile(path: string): void
  /** Receives the function that prints the poster. */
  printer: { current: (() => void) | undefined }
}

const savedZoom = (): Zoom => {
  try {
    return JSON.parse(localStorage.getItem('poster-studio:zoom') ?? '') as Zoom
  } catch {
    return { fit: 'width' }
  }
}

export function Preview({ source, version, hidden, onDiagnostics, onOpenFile, printer }: Props) {
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)]
  const canvas = useRef<HTMLDivElement>(null)
  const active = useRef(0)
  const [shown, setShown] = useState(0)
  const [size, setSize] = useState({ width: 3179, height: 4494 }) // A0 portrait in CSS pixels until the first build
  const [view, setView] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState<Zoom>(savedZoom)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const urls = useRef(new Map<string, { blob: Blob; url: string }>())
  const anchor = useRef<{ x: number; y: number; px: number; py: number }>(undefined)
  const pointer = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean }>(undefined)
  const hovered = useRef<HTMLElement>(undefined)
  const [cursor, setCursor] = useState('grab')

  const fitWidth = (view.width - 2 * pad) / size.width
  const fitPage = Math.min(fitWidth, (view.height - 2 * pad) / size.height)
  const scale = Math.max(0.02, 'fit' in zoom ? (zoom.fit === 'width' ? fitWidth : fitPage) : zoom.scale)
  const sheet = { width: size.width * scale, height: size.height * scale }
  const stage = { width: Math.max(view.width, sheet.width + 2 * pad), height: Math.max(view.height, sheet.height + 2 * pad) }
  const offset = { left: (stage.width - sheet.width) / 2, top: sheet.height + 2 * pad > view.height ? pad : (stage.height - sheet.height) / 2 }

  const print = () => frames[active.current].current?.contentWindow?.print()
  printer.current = print

  useEffect(() => {
    try {
      localStorage.setItem('poster-studio:zoom', JSON.stringify(zoom))
    } catch {}
  }, [zoom])

  /** Zooms to scale, keeping the poster point under (px, py) on the canvas in place (default: the middle). */
  const zoomTo = (next: number, px = view.width / 2, py = view.height / 2) => {
    const element = canvas.current!
    anchor.current = { x: (element.scrollLeft + px - offset.left) / scale, y: (element.scrollTop + py - offset.top) / scale, px, py }
    setZoom({ scale: Math.min(4, Math.max(0.05, next)) })
  }
  const step = (direction: 1 | -1) => {
    const next = direction > 0 ? steps.find((value) => value > scale * 1.01) : steps.findLast((value) => value < scale / 1.01)
    zoomTo(next ?? scale)
  }
  useLayoutEffect(() => {
    const target = anchor.current
    if (!target || !canvas.current) return
    anchor.current = undefined
    canvas.current.scrollLeft = offset.left + target.x * scale - target.px
    canvas.current.scrollTop = offset.top + target.y * scale - target.py
  }, [scale])

  // The wheel listener is installed once; it calls the current zoom function through this ref
  const zoomRef = useRef((factor: number, px: number, py: number) => zoomTo(scale * factor, px, py))
  zoomRef.current = (factor, px, py) => zoomTo(scale * factor, px, py)

  useEffect(() => {
    const element = canvas.current!
    const observer = new ResizeObserver(() => setView({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    // Ctrl/⌘ + wheel and trackpad pinch zoom the poster, not the page (needs a listener that is not passive)
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomRef.current(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002)), event.clientX - rect.left, event.clientY - rect.top)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        print()
      }
    }
    addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', onWheel)
      removeEventListener('keydown', onKey)
    }
  }, [])
  useEffect(() => () => urls.current.forEach(({ url }) => URL.revokeObjectURL(url)), [])

  useEffect(() => {
    const current = ++generation.current
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        // Pictures reach the sandboxed page as blob: URLs; a URL is made again only when its file has changed
        const paths = await source.list()
        const retired: string[] = []
        for (const path of paths.filter((path) => pictures.test(path))) {
          const blob = await source.read(path)
          const known = urls.current.get(path)
          if (!blob || known?.blob === blob) continue
          if (known) retired.push(known.url)
          urls.current.set(path, { blob, url: URL.createObjectURL(typed(path, blob)) })
        }
        const result = await build({ files: source, resolveUrl: (path) => urls.current.get(path)?.url ?? path })
        if (current !== generation.current) return

        const next = 1 - active.current
        const frame = frames[next].current!
        await new Promise((resolve) => {
          frame.onload = resolve
          frame.srcdoc = result.html
        })
        const finished = await finish(frame.contentDocument!)
        if (current !== generation.current) return
        active.current = next
        hovered.current = undefined
        setShown(next)
        setSize({ width: finished.width, height: finished.height })
        retired.forEach((url) => URL.revokeObjectURL(url))
        onDiagnostics([...result.diagnostics, ...finished.diagnostics])
      } catch (error) {
        onDiagnostics([{ severity: 'error', message: `The preview failed: ${error instanceof Error ? error.message : String(error)}` }])
      } finally {
        if (current === generation.current) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [source, version])

  /** The element of the poster under the pointer that names its file (a box, the header, the footer). */
  const fileAt = (event: PointerEvent) => {
    const frame = frames[active.current].current
    const rect = frame?.getBoundingClientRect()
    if (!frame || !rect) return undefined
    const element = frame.contentDocument?.elementFromPoint((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale)
    return element?.closest<HTMLElement>('[data-file]') ?? undefined
  }
  const hover = (element: HTMLElement | undefined) => {
    if (hovered.current === element) return
    hovered.current?.removeAttribute('data-hover')
    element?.setAttribute('data-hover', '')
    hovered.current = element
    setCursor(element ? 'pointer' : 'grab')
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    const element = canvas.current!
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }
    element.focus({ preventScroll: true })
  }
  const onPointerMove = (event: PointerEvent) => {
    const drag = pointer.current
    if (!drag) return hover(fileAt(event))
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    if (!drag.moved) {
      drag.moved = true
      hover(undefined)
      setCursor('grabbing')
    }
    canvas.current!.scrollLeft = drag.left - dx
    canvas.current!.scrollTop = drag.top - dy
  }
  const onPointerUp = (event: PointerEvent) => {
    const drag = pointer.current
    pointer.current = undefined
    if (!drag) return
    if (drag.moved) setCursor('grab')
    else if (event.button === 0) {
      const file = fileAt(event)?.dataset.file
      if (file) onOpenFile(file)
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey) return
    if (event.key === '+' || event.key === '=') step(1)
    else if (event.key === '-') step(-1)
    else if (event.key === '0') setZoom({ fit: 'width' })
    else if (event.key === '9') setZoom({ fit: 'page' })
    else return
    event.preventDefault() // also keeps Ctrl + plus from zooming the whole editor
  }

  const isFit = (fit: 'width' | 'page') => 'fit' in zoom && zoom.fit === fit
  return (
    <section class={hidden ? 'preview hidden' : 'preview'} aria-label="Preview">
      <div class="canvas" ref={canvas} tabIndex={0} onKeyDown={onKeyDown}>
        <div class="stage" style={{ width: `${stage.width}px`, height: `${stage.height}px` }}>
          <div class="sheet" style={{ left: `${offset.left}px`, top: `${offset.top}px`, width: `${sheet.width}px`, height: `${sheet.height}px` }}>
            {frames.map((frame, i) => (
              <iframe
                key={i}
                ref={frame}
                title="Poster"
                sandbox="allow-same-origin allow-modals"
                scrolling="no"
                tabIndex={-1}
                class={i === shown ? 'shown' : undefined}
                style={{ width: `${size.width}px`, height: `${size.height}px`, transform: `scale(${scale})` }}
              />
            ))}
            <div
              class="glass"
              style={{ cursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (pointer.current = undefined)}
              onPointerLeave={() => !pointer.current && hover(undefined)}
            />
          </div>
        </div>
      </div>
      {busy && <div class="busy">Updating…</div>}
      <div class="zoombar" role="toolbar" aria-label="Zoom">
        <button class="ghost icon-only" onClick={() => step(-1)} title="Zoom out (−)">
          <Icon icon={ZoomOut} />
        </button>
        <span class="zoom-value">{Math.round(scale * 100)} %</span>
        <button class="ghost icon-only" onClick={() => step(1)} title="Zoom in (+). Ctrl/⌘ + wheel or pinch zooms at the pointer">
          <Icon icon={ZoomIn} />
        </button>
        <span class="divider" />
        <button class={isFit('width') ? 'ghost icon-only on' : 'ghost icon-only'} onClick={() => setZoom({ fit: 'width' })} title="Fit width (0)">
          <Icon icon={MoveHorizontal} />
        </button>
        <button class={isFit('page') ? 'ghost icon-only on' : 'ghost icon-only'} onClick={() => setZoom({ fit: 'page' })} title="Whole poster (9)">
          <Icon icon={Maximize} />
        </button>
        <button class={!('fit' in zoom) && zoom.scale === 1 ? 'ghost on' : 'ghost'} onClick={() => zoomTo(1)} title="Print size on screen">
          100 %
        </button>
      </div>
    </section>
  )
}
