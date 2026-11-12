// Loads the vendored Vega and Vega-Lite builds in Node and returns them as { vega, vegaLite }.
// They are UMD bundles, so they are evaluated once with module/define hidden and attach themselves to globalThis.
// Pass the result to check(), renderHTML(), renderSVG() or the WhatsApp plan() so charts can be validated and drawn.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINE_FILES = {
  vega: path.join(ROOT, 'vendor/vega-6.4.0.min.js'),
  vegaLite: path.join(ROOT, 'vendor/vega-lite-6.5.0.min.js'),
};

let engines = null;
export function loadEngines() {
  if (engines) return engines;
  if (!globalThis.vega || !globalThis.vegaLite) {
    for (const f of [ENGINE_FILES.vega, ENGINE_FILES.vegaLite]) new Function('module', 'exports', 'define', 'require', fs.readFileSync(f, 'utf8')).call(globalThis);
  }
  return (engines = { vega: globalThis.vega, vegaLite: globalThis.vegaLite });
}
