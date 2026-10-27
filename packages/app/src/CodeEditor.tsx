// A text file in CodeMirror. The document is replaced whenever path or revision change (another file opened, or the
// file changed outside the editor); every edit goes to onChange.
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import { useEffect, useRef } from 'preact/hooks'

type Props = { path: string; text: string; revision: number; goto?: { line: number }; onChange(text: string): void }

/** Quiet colours: the text stays dark, markup is tinted (replaces CodeMirror's default style, which underlines headings). */
const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading, fontWeight: '650', color: '#1e40af' },
    { tag: tags.strong, fontWeight: '650' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.link, tags.url], color: '#2563eb' },
    { tag: [tags.processingInstruction, tags.contentSeparator], color: '#64748b' },
    { tag: tags.quote, color: '#334155' },
    { tag: tags.monospace, color: '#9a3412' },
    { tag: [tags.comment, tags.blockComment], color: '#94a3b8', fontStyle: 'italic' },
    { tag: [tags.tagName, tags.angleBracket], color: '#7c3aed' },
    { tag: tags.attributeName, color: '#0e7490' },
    { tag: [tags.string, tags.attributeValue], color: '#047857' },
    { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: '#1d4ed8' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#b45309' },
    { tag: [tags.keyword, tags.operator, tags.punctuation], color: '#64748b' },
  ]),
)

const language = (path: string) => (path.endsWith('.md') ? [markdown(), EditorView.lineWrapping] : /\.ya?ml$/.test(path) ? yaml() : path.endsWith('.html') ? html() : [])

export function CodeEditor({ path, text, revision, goto, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    view.current = new EditorView({ parent: host.current! })
    return () => view.current?.destroy()
  }, [])

  useEffect(() => {
    const listener = EditorView.updateListener.of((update) => update.docChanged && change.current(update.state.doc.toString()))
    view.current!.setState(EditorState.create({ doc: text, extensions: [basicSetup, highlighting, language(path), listener] }))
  }, [path, revision])

  useEffect(() => {
    if (!goto) return
    const { doc } = view.current!.state
    const line = doc.line(Math.min(Math.max(goto.line, 1), doc.lines))
    view.current!.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
    view.current!.focus()
  }, [goto])

  return <div class="code" ref={host} />
}
