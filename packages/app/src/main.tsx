// Poster Studio: the start screen, or the editor for one poster. The address remembers which poster is open
// (#example, #browser/<id>, #dev/<group>/<name>), so reloading the page keeps it open. A new browser session starts
// with the example poster, which explains how everything works.
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Editor } from './Editor.tsx'
import { Start } from './Start.tsx'
import { browserPoster, getProject } from './sources/browser.ts'
import { devPoster, listDevPosters } from './sources/dev.ts'
import { examplePoster } from './sources/memory.ts'
import type { PosterSource } from './sources/source.ts'
import './styles.css'

async function fromAddress(hash: string): Promise<PosterSource | undefined> {
  const [kind, ...rest] = decodeURIComponent(hash.slice(1)).split('/')
  if (kind === 'example') return examplePoster()
  if (kind === 'browser') {
    const project = await getProject(rest.join('/'))
    return project && browserPoster(project)
  }
  if (kind === 'dev') {
    const poster = (await listDevPosters()).find((poster) => poster.id === rest.join('/'))
    return poster && devPoster(poster)
  }
}

/** True once per browser session (tab): the first visit opens the example poster. */
function firstInSession() {
  try {
    if (sessionStorage.getItem('poster-studio:session')) return false
    sessionStorage.setItem('poster-studio:session', '1')
    return true
  } catch {
    return false
  }
}

let opened = 0 // gives every opened poster its own editor

function App() {
  const [source, setSource] = useState<(PosterSource & { id?: number }) | null>()

  const open = (poster: PosterSource, hash?: string) => {
    history.pushState(null, '', hash ? `#${hash}` : location.pathname)
    setSource({ ...poster, id: ++opened })
  }

  useEffect(() => {
    if (!location.hash && firstInSession()) history.replaceState(null, '', '#example')
    const follow = () =>
      void fromAddress(location.hash)
        .then((found) => setSource(found ? { ...found, id: ++opened } : null))
        .catch(() => setSource(null))
    follow()
    addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])

  useEffect(() => {
    document.title = source ? `${source.name} · Poster Studio` : 'Poster Studio'
  }, [source])

  if (source === undefined) return null
  if (source === null) return <Start onOpen={open} />
  return (
    <Editor
      key={source.id}
      source={source}
      onOpen={open}
      onClose={() => {
        history.pushState(null, '', location.pathname)
        setSource(null)
      }}
    />
  )
}

render(<App />, document.getElementById('app')!)
