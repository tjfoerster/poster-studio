// Makes a template self-contained: every relative url(…) in its CSS and src="…" in its HTML becomes a data: URL.
// Files are found relative to the template; data: URLs that are already there stay as they are, so it can run again
// after replacing one file. Usage: node scripts/inline-assets.mjs template.html [output.html]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'

const types = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

const [input, output = input] = process.argv.slice(2)
if (!input) {
  console.error('Usage: node scripts/inline-assets.mjs template.html [output.html]')
  process.exit(1)
}

const folder = dirname(resolve(input))
// Only references to files (with an extension), so text like url(…) in a comment stays as it is
const isRelative = (url) => !/^([a-z][\w+.-]*:|\/|#)/i.test(url) && /\.\w+$/.test(url)
let count = 0
const dataUrl = (url) => {
  const type = types[extname(url).toLowerCase()]
  if (!type) throw new Error(`Unknown file type: ${url} (supported: ${Object.keys(types).join(', ')})`)
  count++
  return `data:${type};base64,${readFileSync(resolve(folder, decodeURI(url))).toString('base64')}`
}

const html = readFileSync(input, 'utf8')
  .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => (isRelative(url) ? `url(${quote}${dataUrl(url)}${quote})` : match))
  .replace(/\bsrc=(["'])([^"']+)\1/g, (match, quote, url) => (isRelative(url) ? `src=${quote}${dataUrl(url)}${quote}` : match))
writeFileSync(output, html)
console.log(`${count} file(s) inlined into ${output}`)
