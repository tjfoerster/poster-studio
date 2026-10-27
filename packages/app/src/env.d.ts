/** The example poster and the templates, bundled by vite-posters.ts. */
declare module 'virtual:bundled' {
  /** Paths of the example poster's files (below starter/); without template.html if starterTemplate names it. */
  export const starter: string[]
  /** The template the example uses, if its template.html is a copy of one (then served from templates/ only). */
  export const starterTemplate: string | null
  /** Names of the templates (templates/<name>.html). */
  export const templates: string[]
}
