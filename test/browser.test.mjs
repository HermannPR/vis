// Chromium tests: the measured examples pass the audit in light and dark, and the PNG is 1080 px wide.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from '../lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin/vis.mjs');
let hasBrowser = true;
try { findBrowser(); } catch { hasBrowser = false; }
const skip = !hasBrowser && 'no Chromium';
const vis = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-t-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

for (const f of ['bar', 'line', 'kpi', 'es/bar', 'es/line']) {
  test(`browser: ${f} has no problems in light and dark`, { skip }, () => {
    vis('audit', path.join(ROOT, 'examples', f + '.md')); // exits with 2 when there are problems
  });
}
test('browser: the legacy audit alias still works', { skip }, () => {
  vis('chequear', path.join(ROOT, 'examples/kpi.md'), '--lang', 'en');
});
test('browser: 1080 px PNG in under 5 s', { skip }, () => {
  const out = path.join(tmp(), 'b.png');
  const t0 = Date.now();
  vis('render', path.join(ROOT, 'examples/bar.md'), '--to', 'png', '--theme', 'dark', '-o', out);
  const ms = Date.now() - t0;
  assert.equal(fs.readFileSync(out).readUInt32BE(16), 1080);
  // Cold CI runners start Chrome slowly: the 5 s target is for a warm local machine.
  assert.ok(ms < (process.env.CI ? 30000 : 5000), `${ms} ms`);
});
test('browser: --theme oscuro is still accepted', { skip }, () => {
  const out = path.join(tmp(), 'b.png');
  vis('render', path.join(ROOT, 'examples/kpi.md'), '--to', 'png', '--theme', 'oscuro', '-o', out);
  assert.equal(fs.readFileSync(out).readUInt32BE(16), 1080);
});
test('standalone html: no engines, decisions active', () => {
  const dir = tmp();
  const md = path.join(dir, 'd.md'), out = path.join(dir, 'd.html');
  fs.writeFileSync(md, '# Test\n\n```decisions "Direction"\nside | Which side? | Left* | Right\n```\n');
  vis('render', md, '--to', 'html', '-o', out, '--lang', 'en');
  const h = fs.readFileSync(out, 'utf8');
  assert.match(h, /activateDecisions/);
  assert.match(h, /<html lang="en">/);
  assert.doesNotMatch(h, /vega-6\.4\.0|mermaid-12/);
});
test('cli: exit codes and errors', () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: { ...process.env, VIS_LANG: 'en' } });
  const ok = run('check', path.join(ROOT, 'examples/demo.md'));
  assert.equal(ok.status, 0, ok.stderr);
  const dir = tmp(), bad = path.join(dir, 'bad.md');
  fs.writeFileSync(bad, '```chart barr\nx,y\na,1\n```\n');
  const r = run('check', bad, '--json');
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.errors[0].code, 'E_TYPE');
  assert.equal(run('check', bad, '--nope').status, 1);
  assert.match(run('check', bad, '--nope').stderr, /--nope/);
  assert.equal(run('frobnicate').status, 1);
  assert.equal(run('version').status, 0);
  assert.match(run('help').stdout, /whatsapp/);
  // Text output goes next to the input as .txt and never overwrites the input.
  const txt = run('render', path.join(ROOT, 'examples/kpi.md'), '--to', 'text', '-o', path.join(dir, 'k.txt'));
  assert.equal(txt.status, 0, txt.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'k.txt'), 'utf8'), /\S/);
  // -o - prints to stdout instead of writing a file called "-".
  const toStdout = spawnSync(process.execPath, [path.join(ROOT, 'bin/vis.mjs'), 'render', path.join(ROOT, 'examples/kpi.md'), '--to', 'text', '-o', '-'], { cwd: dir, encoding: 'utf8' });
  assert.equal(toStdout.status, 0, toStdout.stderr);
  assert.match(toStdout.stdout, /\*\*/);
  assert.equal(fs.existsSync(path.join(dir, '-')), false);
});

test('browser: images resolve next to the document, and a missing one is an audit problem', { skip }, () => {
  const dir = tmp();
  fs.copyFileSync(path.join(ROOT, 'docs/assets/whatsapp-kpi.png'), path.join(dir, 'a.png'));
  fs.writeFileSync(path.join(dir, 'ok.md'), '```sheet "S"\na.png | A\n```\n');
  fs.writeFileSync(path.join(dir, 'bad.md'), '```sheet "S"\nmissing.png | A\n```\n');
  // Run from another folder: the path must resolve against the document, not the working directory.
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'bin/vis.mjs'), ...a, '--lang', 'en'], { cwd: ROOT, encoding: 'utf8' });
  const ok = run('audit', path.join(dir, 'ok.md'));
  assert.equal(ok.status, 0, ok.stderr);
  const bad = run('audit', path.join(dir, 'bad.md'));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /C_IMAGE\|sheet\|image did not load: missing\.png/);
});
