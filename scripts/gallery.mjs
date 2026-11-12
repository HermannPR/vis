#!/usr/bin/env node
// Renders the README gallery: docs/gallery/<lang>/<name>.md -> docs/assets/gallery/<lang>/<name>.png.
//   node scripts/gallery.mjs [name ...]
// Every image is drawn at phone width in the light theme and must pass the visual audit (--strict).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = new Set(process.argv.slice(2));
let failed = 0;
for (const lang of ['en', 'es']) {
  const src = path.join(ROOT, 'docs/gallery', lang), out = path.join(ROOT, 'docs/assets/gallery', lang);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.md')).sort()) {
    const name = f.slice(0, -3);
    if (only.size && !only.has(name)) continue;
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'bin/vis.mjs'), 'render', path.join(src, f), '--to', 'png', '--theme', 'light',
        '--strict', '--lang', lang, '-o', path.join(out, name + '.png')], { stdio: ['ignore', 'ignore', 'pipe'] });
      console.log(`ok  ${lang}/${name}.png`);
    } catch (e) {
      failed++;
      console.log(`bad ${lang}/${name}.png\n${String(e.stderr || e.message).trim()}`);
    }
  }
}
process.exit(failed ? 1 : 0);
