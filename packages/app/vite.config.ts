import { defineConfig } from 'vite'
import { posters } from './vite-posters.ts'

const jsx = { importSource: 'preact' } // Preact instead of React, for our code and for Vite's dependency scan

export default defineConfig({
  base: './', // the built editor works from any folder of a web server
  plugins: [posters()],
  oxc: { jsx },
  optimizeDeps: { rolldownOptions: { transform: { jsx } } },
})
