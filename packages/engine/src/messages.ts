// Problems in a Markdown file are vfile messages while it is processed, and diagnostics afterwards.
import type { Node } from 'unist'
import type { VFile } from 'vfile'
import type { Diagnostic } from './types.ts'

/** Records a problem without stopping the build; fatal marks an error, as in vfile, but nothing is thrown. */
export function report(file: VFile, severity: Diagnostic['severity'], reason: string, place?: Node) {
  const message = file.message(reason, place)
  message.fatal = severity === 'error'
}

/** The file's messages, in the order of their lines. */
export function diagnosticsOf(file: VFile): Diagnostic[] {
  const messages = file.messages.toSorted((a, b) => (a.line ?? 0) - (b.line ?? 0))
  return messages.map((message) => ({
    severity: message.fatal ? 'error' : 'warning',
    message: message.reason,
    file: file.path || undefined,
    line: message.line ?? undefined,
  }))
}
