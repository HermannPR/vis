// The web client copies vis HTML through a closed list. If vis.js starts producing a new tag or attribute,
// this test warns before the chat drops it silently.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vis = createRequire(import.meta.url)(path.join(ROOT, 'vis.js'));
const F = '```';
// Dropped on purpose: id (clashes with the chat's ids), on* (code), src/alt/loading (outside images), style (moved to data-style).
const DROPPED = new Set(['id', 'onsubmit', 'data-id', 'src', 'alt', 'loading', 'style', 'type']);

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
async function load() {
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-client-'));
  dirs.push(dir);
  const tmp = path.join(dir, 'vis-client.mjs');
  fs.copyFileSync(path.join(ROOT, 'clients/web/vis-client.js'), tmp);
  return import(pathToFileURL(tmp).href);
}

for (const lang of ['en', 'es']) test(`web client: the lists cover everything vis produces in the allowed blocks (${lang})`, async () => {
  const L = (await load()).LISTS;
  const md = [
    `${F}kpi "K"\n- Sales: $1 (+2 %, ok)\n- Errors: 3 (+1, bad)\n${F}`,
    `${F}progress "P"\n- [x] One\n- [~] Two (40 %)\n- [ ] Three\n${F}`,
    `${F}progress value=3 max=8\n${F}`,
    `${F}timeline "T"\n2026-10-28 | Design | done\n2026-11-12 | Launch | pending\n${F}`,
    `${F}compare "C" before=A after=B better=lower\nX | 4 | 2\n${F}`,
    `${F}decisions "D"\nf | Date | Nov 12* ~ plan | Nov 19 | @date\nv+ | Channels | Email | Social | Other...\nn | How many | @range 1-10\nt | Note | @text\n${F}`,
  ].join('\n\n');
  const r = await vis.renderHTML(md, { submitLabel: 'Reply', lang });
  assert.equal(r.errors.length, 0, r.errors.map(vis.formatError).join('\n'));
  const tags = new Set([...r.html.matchAll(/<([a-z][a-z0-9]*)/g)].map(m => m[1]));
  for (const e of tags) assert.ok(L.TAGS.has(e) || L.ICON_TAGS.has(e), `tag outside the list: <${e}>`);
  const attrs = new Set([...r.html.matchAll(/\s([a-zA-Z-]+)="/g)].map(m => m[1]));
  for (const a of attrs) assert.ok(L.ATTRIBUTES.has(a) || a in L.SVG_ATTRIBUTES || DROPPED.has(a), `attribute outside the list: ${a}`);
  for (const m of r.html.matchAll(/\sstyle="([^"]*)"/g)) for (const d of m[1].split(';').filter(Boolean)) {
    const [k, v] = d.split(':').map(x => x.trim());
    assert.ok(L.STYLES[k]?.test(v), `style the client does not copy: ${d}`);
  }
});
test('web client: has() finds canonical types and Spanish aliases', async () => {
  const { has } = await load();
  assert.ok(has(`${F}kpi\n- A: 1\n${F}`));
  assert.ok(has(`${F}decisiones\na | B? | C | D\n${F}`));
  assert.ok(!has(`${F}js\nlet a\n${F}`));
  assert.ok(!has('plain text'));
});
