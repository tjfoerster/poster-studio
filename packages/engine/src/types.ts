/** A problem found while building or laying out a poster. file and line point to where it can be fixed. */
export type Diagnostic = { severity: 'error' | 'warning'; message: string; file?: string; line?: number }

/** Read access to a poster folder: paths are relative to it, with "/" separators (sections/results.md). */
export type PosterFiles = {
  list(): Promise<string[]>
  /** The file, or undefined if it does not exist. */
  read(path: string): Promise<Blob | undefined>
}
