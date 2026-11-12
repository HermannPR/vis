// Builds clients/web/dist: the files a web chat serves next to its own (same origin, strict CSP).
//   node clients/web/build.mjs [--host-css <file>] [--out <dir>]
// --host-css appends the host's own rules to vis.css (for example, mapping the chat's color tokens to --vis-*).
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const hostCSS = opt('--host-css')
const DIST = path.resolve(opt('--out') || path.join(HERE, 'dist'))
const vis = createRequire(import.meta.url)(path.join(ROOT, 'vis.js'))
fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(DIST, { recursive: true })
const copy = (from, to) => fs.copyFileSync(path.join(ROOT, from), path.join(DIST, to || path.basename(from)))

copy('vis.js')
copy('vendor/vega-6.4.0.min.js')
copy('vendor/vega-lite-6.5.0.min.js')
copy('clients/web/vis-client.js')

// vega-interpreter ships as a module that imports 'vega-util'; the browser cannot resolve that name.
// The three pieces it needs are already on Vega's global, so the line becomes a read of the global.
const IMPORT = "import { ascending, isString, DisallowedObjectProperties } from 'vega-util';"
const interpreter = fs.readFileSync(path.join(ROOT, 'vendor/vega-interpreter-2.3.2.js'), 'utf8')
if (!interpreter.startsWith(IMPORT + '\n')) throw new Error('vega-interpreter changed: check its first line')
fs.writeFileSync(path.join(DIST, 'vega-interpreter-2.3.2.browser.js'),
  '// Derived from vega-interpreter 2.3.2 (BSD-3-Clause): only the vega-util import is replaced by Vega\'s global.\n' +
  '// Copyright (c) 2015-2023, University of Washington Interactive Data Lab. Full license in LICENSES.txt.\n' +
  'const { ascending, isString, DisallowedObjectProperties } = globalThis.vega;\n' + interpreter.slice(IMPORT.length + 1))

// What vis-client.js needs in any chat: undrawn blocks as code, and kpi values that do not wrap (the client
// shrinks the font when they do not fit).
const CLIENT = `
.vis-doc pre.vis-raw{margin:.5em 0;padding:8px 12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.vis-doc .vis-raw-type{display:block;font-size:12px;color:var(--vis-text2);margin-bottom:2px}
.vis-doc .vis-kpi-value{white-space:nowrap;overflow-wrap:normal}
`
// vis light and dark (following the system, like most chats), then the host's rules.
fs.writeFileSync(path.join(DIST, 'vis.css'), vis.css({ theme: 'light' }) +
  `@media (prefers-color-scheme: dark){.vis-doc{${vis.cssVars(vis.THEMES.dark)}}}\n` + CLIENT +
  (hostCSS ? '\n' + fs.readFileSync(path.resolve(hostCSS), 'utf8') : ''))

// The notices the BSD and MIT licenses ask for travel with the files (they do not need to be served).
fs.writeFileSync(path.join(DIST, 'LICENSES.txt'), [
  ['vis.js, vis-client.js, vis.css', 'LICENSE'],
  ['vega-6.4.0.min.js', 'licenses/vega.LICENSE.txt'], ['vega-lite-6.5.0.min.js', 'licenses/vega-lite.LICENSE.txt'],
  ['vega-interpreter-2.3.2.browser.js', 'licenses/vega-interpreter.LICENSE.txt'],
].map(([what, file]) => `== ${what} ==\n` + fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n'))

const files = fs.readdirSync(DIST).sort()
const sha = f => createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('base64')
fs.writeFileSync(path.join(DIST, 'CHECKSUMS.txt'), files.map(f => `sha256-${sha(f)}  ${f}`).join('\n') + '\n')
console.log(files.map(f => `${f} ${fs.statSync(path.join(DIST, f)).size}`).join('\n'))
