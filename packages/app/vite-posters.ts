// Vite plugin of Poster Studio.
// - npm run dev: the poster folders on this computer (examples/, posters/ and the folder in $POSTERS) under /__posters:
//   list them, read, write and delete their files; a "posters:change" event tells the page when a file changes on disk.
// - Dev and build: the example poster (opened at the start of a session, and the starter for "New poster") under
//   starter/ and the templates under templates/ (with their font licence), as static files; the virtual module
//   "virtual:bundled" lists them. templates/ itself answers with a JSON list of its files, as nginx does in production.
//   The example's template.html is one of the templates, so it is shipped once, under templates/.
import { type FSWatcher, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const starter = join(repository, 'examples/welcome')
const templates = join(repository, 'templates')

/** Every file below folder (paths relative to it, with "/"), without hidden files. */
function walk(folder: string, prefix = ''): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return []
    const path = prefix + entry.name
    return entry.isDirectory() ? walk(join(folder, entry.name), `${path}/`) : [path]
  })
}

const templateNames = () => walk(templates).filter((path) => path.endsWith('.html')).map((path) => path.slice(0, -'.html'.length))
/** The template that the example's template.html is a copy of. */
const starterTemplate = () => {
  const copy = readFileSync(join(starter, 'template.html'))
  return templateNames().find((name) => readFileSync(join(templates, `${name}.html`)).equals(copy))
}
const starterFiles = () => walk(starter).filter((path) => path !== 'template.html' || !starterTemplate())

/** The folder inside root that path points to, or undefined if path would leave root. */
function inside(root: string, path: string) {
  const target = resolve(root, path)
  return target.startsWith(root + sep) && !path.includes('\0') ? target : undefined
}

export function posters(): Plugin {
  const roots: Record<string, string> = { examples: join(repository, 'examples'), posters: join(repository, 'posters') }
  if (process.env.POSTERS) {
    const name = basename(resolve(process.env.POSTERS))
    roots[name in roots ? `${name}-POSTERS` : name] = resolve(process.env.POSTERS)
  }

  /** A poster folder by its id ("examples/welcome"): a folder with a poster.yaml directly inside one of the roots. */
  const folderOf = (id: string) => {
    const [group, name, ...rest] = id.split('/')
    const folder = roots[group] && name && rest.length === 0 ? inside(roots[group], name) : undefined
    return folder && existsSync(join(folder, 'poster.yaml')) ? folder : undefined
  }

  const send = (response: ServerResponse, status: number, body: string | Buffer = '', type = 'text/plain') => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body)
  }
  const serveFile = (folder: string, path: string, response: ServerResponse) => {
    const file = inside(folder, decodeURIComponent(path))
    if (file && existsSync(file) && statSync(file).isFile()) send(response, 200, readFileSync(file), 'application/octet-stream')
    else send(response, 404, 'Not found')
  }

  async function postersApi(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/') {
      const list = Object.entries(roots).flatMap(([group, root]) =>
        existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && folderOf(`${group}/${entry.name}`)).map((entry) => ({ id: `${group}/${entry.name}`, name: entry.name, group })) : [],
      )
      return send(response, 200, JSON.stringify(list), 'application/json')
    }
    const folder = folderOf(url.searchParams.get('poster') ?? '')
    if (!folder) return send(response, 404, 'No such poster')
    if (url.pathname === '/files') return send(response, 200, JSON.stringify(walk(folder)), 'application/json')
    const path = url.searchParams.get('path') ?? ''
    const file = url.pathname === '/file' ? inside(folder, path) : undefined
    if (!file) return send(response, 400, 'Bad request')
    if (request.method === 'PUT') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk as Buffer)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, Buffer.concat(chunks))
      return send(response, 204)
    }
    if (request.method === 'DELETE') {
      rmSync(file, { force: true })
      return send(response, 204)
    }
    serveFile(folder, path, response)
  }

  return {
    name: 'posters',

    resolveId: (id) => (id === 'virtual:bundled' ? '\0virtual:bundled' : undefined),
    load: (id) =>
      id === '\0virtual:bundled'
        ? [`export const starter = ${JSON.stringify(starterFiles())}`, `export const starterTemplate = ${JSON.stringify(starterTemplate() ?? null)}`, `export const templates = ${JSON.stringify(templateNames())}`, ''].join('\n')
        : undefined,

    configureServer(server) {
      server.middlewares.use('/__posters', (request, response) => void postersApi(request, response).catch((error) => send(response, 500, String(error))))
      server.middlewares.use('/starter', (request, response) => serveFile(starter, new URL(request.url ?? '/', 'http://localhost').pathname.slice(1), response))
      server.middlewares.use('/templates', (request, response) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        if (path === '/') return send(response, 200, JSON.stringify(walk(templates).map((name) => ({ name, type: 'file' }))), 'application/json')
        serveFile(templates, path.slice(1), response)
      })

      // Our own watcher: Vite's would reload the whole page when a template.html changes
      const timers = new Map<string, ReturnType<typeof setTimeout>>()
      const watchers: FSWatcher[] = Object.entries(roots)
        .filter(([, root]) => existsSync(root))
        .map(([group, root]) =>
          watch(root, { recursive: true }, (_event, filename) => {
            const [name, ...rest] = String(filename ?? '').split(sep)
            const path = rest.join('/')
            if (!path || path.split('/').some((part) => part.startsWith('.')) || !folderOf(`${group}/${name}`)) return
            const key = `${group}/${name}/${path}`
            clearTimeout(timers.get(key))
            timers.set(key, setTimeout(() => server.ws.send({ type: 'custom', event: 'posters:change', data: { poster: `${group}/${name}`, path } }), 100))
          }),
        )
      server.httpServer?.on('close', () => watchers.forEach((watcher) => watcher.close()))
    },

    generateBundle() {
      for (const path of starterFiles()) this.emitFile({ type: 'asset', fileName: `starter/${path}`, source: readFileSync(join(starter, path)) })
      for (const path of walk(templates)) this.emitFile({ type: 'asset', fileName: `templates/${path}`, source: readFileSync(join(templates, path)) })
    },
  }
}
