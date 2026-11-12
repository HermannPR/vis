// WhatsApp adapter tests: part order, captions, polls, what stays as text and the phone PNG.
// The Spanish message checks the exact wording of earlier versions; the English cases check the translation.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { toWhatsApp, plan, shortText, LIMITS } from '../adapters/whatsapp.mjs';
import { findBrowser } from '../lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vis = require(path.join(ROOT, 'vis.js'));
const F = '```';
let hasBrowser = true;
try { findBrowser(); } catch { hasBrowser = false; }
const es = { lang: 'es' };

const MESSAGE = `## Resumen

Las visitas **subieron** y la app pasa de *14 mil*.

${F}kpi "Esta semana"
- Ventas: $184,300 (+12 %, ok)
- Devoluciones: 3.1 % (+0.8 pts, alerta)
${F}

${F}chart line "Visitas" unit=miles
mes,Sitio,App
2026-05,16.8,7.9
2026-06,17.5,9.2
2026-07,16.1,10.4
2026-08,18.3,11.8
2026-09,19.7,12.5
2026-10,21.2,14.1
2026-11,22.0,15.3
${F}

${F}decisions "Siguiente paso"
lanzamiento | ¿Cuándo lanzamos? | 12 nov* ~ lo planeado | 19 nov | @fecha
aviso+ | ¿Por dónde avisamos? | Correo | Redes | WhatsApp
${F}
`;
const block = md => vis.parse(md).find(s => s.kind === 'block');

test('whatsapp: markdown to WhatsApp formatting', () => {
  const t = toWhatsApp('# Title\n\nA **fact** and something *soft*, ~~old~~, `x*y` and [the guide](https://a.b/c).\n\n* one\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![logo](l.png)');
  assert.match(t, /^\*Title\*/);
  assert.match(t, /A \*fact\* and something _soft_, ~old~, `x\*y` and the guide \(https:\/\/a\.b\/c\)\./);
  assert.match(t, /^- one$/m);
  assert.match(t, /```\n\| a \| b \|\n\| 1 \| 2 \|\n```/);
  assert.doesNotMatch(t, /\|---/);
  assert.match(t, /^logo$/m);
});

test('whatsapp: parts in order with text, images and one poll per question', () => {
  const { parts, fallback, warnings } = plan(MESSAGE, {}, es);
  // The text on top fits in the first image's caption: one message less.
  assert.deepEqual(parts.map(p => p.type), ['image', 'image', 'poll', 'poll']);
  assert.deepEqual(parts.map(p => p.block), ['kpi#1', 'chart#2', 'decisions#3', 'decisions#3']);
  assert.match(parts[0].caption, /^\*Resumen\*\n\nLas visitas \*subieron\* y la app pasa de _14 mil_\.\n\n\*Esta semana\*/);
  assert.deepEqual(warnings, []);
  // The fallback gathers everything for when the images do not load.
  for (const p of parts) assert.ok(fallback.includes(p.text || p.caption || p.numbered));
  // The source is the whole block, ready to be drawn alone.
  assert.match(parts[0].source, /^```kpi "Esta semana"\n[\s\S]+\n```$/);
});

test('whatsapp: kpi caption and a long chart caption', () => {
  const [kpi, chart] = plan(MESSAGE.replace(/^## Resumen[\s\S]*?(?=```kpi)/, ''), {}, es).parts;
  // The status as an icon, in the same order as the image.
  assert.equal(kpi.caption, '*Esta semana*\n✅ Ventas: *$184,300* (+12 %)\n⚠️ Devoluciones: *3.1 %* (+0.8 pts)');
  assert.equal(kpi.alt, 'Esta semana\n✅ Ventas: $184,300 (+12 %)\n⚠️ Devoluciones: 3.1 % (+0.8 pts)');
  // Over time: the last value and the change since the first, one line per series.
  assert.equal(chart.caption, '*Visitas (miles)*\n- Sitio: 22 en nov (+31 % desde may)\n- App: 15.3 en nov (+94 % desde may)');
  const en = plan(MESSAGE.replace(/^## Resumen[\s\S]*?(?=```kpi)/, '')).parts[1];
  assert.equal(en.caption, '*Visitas (miles)*\n- Sitio: 22 in Nov (+31 % since May)\n- App: 15.3 in Nov (+94 % since May)');
});

test('whatsapp: progress, timeline, compare and donut captions', () => {
  const S = md => shortText(block(md), 'es');
  assert.equal(S(`${F}progress "Migración" value=3 max=4\n- [x] Datos\n- [~] Pruebas (60 %)\n${F}`), '*Migración*\n3 de 4 (75 %)\n- Datos: listo\n- Pruebas: en curso (60 %)');
  // Without a given percentage none is made up.
  assert.equal(S(`${F}progress "Panel"\n- [~] Prueba\n${F}`), '*Panel*\n50 %\n- Prueba: en curso');
  assert.match(S(`${F}timeline "Plan"\n2026-11-04 | Pruebas | hecho\n2026-11-12 | Lanzamiento\n${F}`), /^\*Plan\*\n- 4 nov: Pruebas \(listo\)\n- 12 nov: Lanzamiento$/);
  assert.match(S(`${F}timeline\n2026-12-20 | Cierre | listo\n2027-01-08 | Arranque\n${F}`), /- 20 dic 2026: Cierre \(listo\)\n- 8 ene 2027: Arranque$/);
  assert.equal(S(`${F}compare "Pagos" before=oct after=nov\nFallidos | 40 | 30\n${F}`), '*Pagos*\noct → nov\n- Fallidos: 40 → 30, -25 %');
  assert.equal(S(`${F}chart line "Picos"\nmes,n\n2026-01,10\n2026-02,30\n2026-03,20\n${F}`), '*Picos*\n- n: 20 en mar (+100 % desde ene); pico 30 en feb');
  assert.equal(S(`${F}chart bar "Canal"\ncanal,n\nWeb,3\nTienda,1\n${F}`), '*Canal*\n- Web: 3\n- Tienda: 1');
  assert.match(S(`${F}chart donut "Canal"\ncanal,n\nWeb,3\nTienda,1\n${F}`), /- Web: 3 \(75 %\)\n- Tienda: 1 \(25 %\)$/);
  // A late or blocked status is shown as written.
  assert.match(S(`${F}timeline\n2026-11-04 | Pruebas | atrasado\n${F}`), /Pruebas \(atrasado\)$/);
});

test('whatsapp: English captions', () => {
  const S = md => shortText(block(md), 'en');
  assert.equal(S(`${F}progress "Migration" value=3 max=4\n- [x] Data\n- [~] Tests (60 %)\n- [ ] Launch\n${F}`), '*Migration*\n3 of 4 (75 %)\n- Data: done\n- Tests: in progress (60 %)\n- Launch: pending');
  assert.match(S(`${F}timeline\n2026-12-20 | Close | done\n2027-01-08 | Start | late\n${F}`), /- Dec 20, 2026: Close \(done\)\n- Jan 8, 2027: Start \(late\)$/);
  assert.equal(S(`${F}compare "Payments"\nFailed | 40 | 30\n${F}`), '*Payments*\n- Failed: 40 → 30, -25 %');
  assert.equal(S(`${F}chart bar "Peaks"\nmonth,n\n2026-01,10\n2026-02,30\n2026-03,20\n${F}`), '*Peaks*\n- n: 20 in Mar (+100 % since Jan); peak 30 in Feb');
  assert.equal(S(`${F}chart bar "By store"\nstore,a,b\nNorth,1,5\nSouth,3,2\nEast,9,4\nWest,2,2\nCenter,7,1\nPort,4,8\nHill,5,5\n${F}`), '*By store*\n- a: max 9 (East), min 1 (North)\n- b: max 8 (Port), min 1 (Center)');
});

test('whatsapp: caption cut at whole lines at 1024', () => {
  const rows = Array.from({ length: 40 }, (_, i) => `2026-11-${String(i % 28 + 1).padStart(2, '0')} | Un evento con un nombre bastante largo, número ${i} | listo`).join('\n');
  const [p] = plan(`${F}timeline "Muchos"\n${rows}\n${F}`, {}, es).parts;
  assert.ok(p.caption.length <= LIMITS.caption, String(p.caption.length));
  assert.match(p.caption, /número \d+ \(listo\)\n…$/);
});

test('whatsapp: polls within the limits and always numbered', () => {
  const [, , one, several] = plan(MESSAGE, {}, es).parts;
  assert.equal(one.id, 'lanzamiento');
  // First how to answer; the number goes apart from the option.
  assert.equal(one.numbered, '_Siguiente paso_\n*Pregunta 1 de 2:* ¿Cuándo lanzamos?\nContesta con el número o escribe otra fecha (día y mes), citando este mensaje:\n*1* · 12 nov (recomendada): lo planeado\n*2* · 19 nov');
  assert.deepEqual(one.poll, { question: '¿Cuándo lanzamos? (o escribe otra fecha)', options: ['12 nov (recomendada): lo planeado', '19 nov'], multiple: false });
  assert.equal(several.poll.multiple, true);
  assert.equal(several.numbered, '*Pregunta 2 de 2:* ¿Por dónde avisamos?\nContesta con uno o varios números (por ejemplo: 1 3), citando este mensaje:\n*1* · Correo\n*2* · Redes\n*3* · WhatsApp');
  const en = plan(`${F}decisions "Next step"\nlaunch | When do we launch? | Nov 12* ~ as planned | Nov 19 | @date\nnotify+ | Where? | Email | Other...\n${F}`).parts;
  assert.equal(en[0].numbered, '_Next step_\n*Question 1 of 2:* When do we launch?\nReply with the number or write another date (day and month), quoting this message:\n*1* · Nov 12 (recommended): as planned\n*2* · Nov 19');
  assert.equal(en[0].poll.question, 'When do we launch? (or write another date)');
  assert.match(en[1].numbered, /Reply with one or more numbers \(for example: 1 3\) or write your own, quoting this message:\n\*1\* · Email\n\*2\* · Other \(write it\)$/);
});

test('whatsapp: no poll outside 2 to 12 options or with options repeated after cutting', () => {
  const thirteen = Array.from({ length: 13 }, (_, i) => `op${i}`).join(' | ');
  const long = 'x'.repeat(120);
  const ps = plan(`${F}decisions\nfecha | ¿Qué día? | @fecha\nmucho | ¿Cuál? | ${thirteen}\nlargo | ¿Cuál? | ${long}a | ${long}b\ncorta | ${'¿'.padEnd(300, 'p')}? | Sí | No\n${F}`, {}, es).parts;
  assert.equal(ps[0].poll, null);
  assert.equal(ps[0].reason, 'sin opciones');
  assert.match(ps[0].numbered, /Contesta con una fecha \(día y mes\), citando este mensaje\.$/);
  assert.equal(ps[1].poll, null);
  assert.match(ps[1].reason, /13 opciones/);
  assert.match(ps[1].numbered, /\n\*13\* · op12$/);
  assert.equal(ps[2].poll, null);
  assert.match(ps[2].reason, /repetidas/);
  assert.equal(ps[3].poll.question.length, LIMITS.question);
  for (const p of ps) for (const o of p.poll?.options || []) assert.ok(o.length <= LIMITS.option);
  assert.equal(plan(`${F}decisions\nd | Day? | @date\n${F}`).parts[0].reason, 'no options');
});

test('whatsapp: invalid blocks and unsupported types stay as text', () => {
  const md = `Hola\n\n${F}kpi\n- Ventas: $184,300 | +12 % | ok\n${F}\n\n${F}vega-lite\n{"data":{"url":"https://x"}}\n${F}\n\n${F}compare\na.png | b.png\n${F}\n\n${F}js\nlet a = 1\n${F}\n\n${F}timeline\n2026-11-04 | sin cerrar`;
  const { parts, warnings } = plan(md, {}, es);
  assert.deepEqual(parts.map(p => p.type), ['text']);
  const t = parts[0].text;
  assert.match(t, /^Hola\n\n_kpi sin dibujar_\n```\n- Ventas: \$184,300 \| \+12 % \| ok\n```/);
  assert.match(t, /_vega-lite sin dibujar_\n```\n\{"data"/);
  assert.match(t, /_compare sin dibujar_/);
  assert.match(t, /```\nlet a = 1\n```/); // regular code stays the same
  assert.match(t, /_timeline sin dibujar_/);
  // A long text is not merged with the next image.
  const long = plan(`${'Mucho texto. '.repeat(90)}\n\n${F}kpi\n- A: 1\n${F}`, {}, es).parts;
  assert.deepEqual(long.map(p => p.type), ['text', 'image']);
  assert.equal(warnings.length, 4);
  assert.match(warnings.join('\n'), /vega-lite#\d+: vega-lite no se dibuja en WhatsApp/);
  assert.match(warnings.join('\n'), /compare con imagenes va como texto/);
  assert.match(warnings.join('\n'), /bloque sin cerrar/);
  const en = plan(md);
  assert.match(en.parts[0].text, /_kpi not drawn_/);
  assert.match(en.warnings.join('\n'), /vega-lite#\d+: vega-lite is not drawn in WhatsApp; sent as text/);
});

test('whatsapp: warning with more than 6 messages', () => {
  const blocks = Array.from({ length: 7 }, (_, i) => `${F}kpi\n- A: ${i}\n${F}`).join('\n\n');
  assert.match(plan(blocks, {}, es).warnings.at(-1), /7 mensajes seguidos/);
  const { parts, warnings } = plan(blocks);
  assert.equal(parts.length, 7);
  assert.match(warnings.at(-1), /7 messages in a row/);
});

test('chart: bars grouped by date on a discrete axis, with a date label', () => {
  const b = block(`${F}chart bar "Orders"\nday,Web,Store\n2026-10-01,137,83\n2026-10-02,114,66\n2026-10-03,151,89\n${F}`);
  const { encoding: e } = vis.chartToVegaLite(b, { width: 640 });
  // xOffset only separates bars when x is discrete; labelExpr writes the date because axis.format is ignored there.
  assert.equal(e.x.type, 'ordinal');
  assert.equal(e.x.timeUnit, 'utcyearmonthdate');
  assert.equal(e.xOffset.field, 'series');
  assert.match(e.x.axis.labelExpr, /^utcFormat\(datum\.value, '%b %-d'\)$/);
  assert.equal(e.x.axis.format, undefined);
  assert.match(vis.chartToVegaLite(b, { width: 640, lang: 'es' }).encoding.x.axis.labelExpr, /'%-d %b'/);
});

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
function runWhatsApp(md, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-wa-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'm.md'), md);
  execFileSync(process.execPath, [path.join(ROOT, 'bin/vis.mjs'), 'whatsapp', path.join(dir, 'm.md'), '-o', path.join(dir, 'out'), ...args], { stdio: 'pipe' });
  return { dir, manifest: JSON.parse(fs.readFileSync(path.join(dir, 'out/manifest.json'), 'utf8')) };
}
test('whatsapp: the CLI draws phone PNGs and writes manifest.json (vis-whatsapp/2)', { skip: !hasBrowser && 'no Chromium' }, () => {
  const { dir, manifest: m } = runWhatsApp(MESSAGE, ['--strict', '--lang', 'es']);
  assert.equal(m.format, 'vis-whatsapp/2');
  assert.equal(m.lang, 'es'); assert.equal(m.theme, 'light'); assert.equal(m.width, 320);
  assert.ok(!fs.existsSync(path.join(dir, 'out/manifiesto.json')));
  const imgs = m.parts.filter(p => p.type === 'image');
  assert.equal(imgs.length, 2);
  assert.deepEqual(m.parts.map(p => p.type), ['image', 'image', 'poll', 'poll']);
  for (const p of imgs) {
    assert.equal(p.source, undefined);
    for (const f of p.files) {
      const png = fs.readFileSync(path.join(dir, 'out', f.file));
      assert.equal(png.readUInt32BE(16), 1080);
      assert.equal(f.width, 1080);
      assert.equal(f.height, png.readUInt32BE(20));
      assert.equal(f.bytes, png.length);
      assert.ok(f.height <= 1600);
      assert.ok(f.caption.length <= LIMITS.caption);
    }
  }
  assert.match(m.parts[0].files[0].caption, /^\*Resumen\*/);
});
test('whatsapp: the legacy Spanish flags still work and mean Spanish', { skip: !hasBrowser && 'no Chromium' }, () => {
  const md = `${F}kpi "Semana"\n- Ventas: $10 (+2 %, ok)\n${F}`;
  const { manifest: m } = runWhatsApp(md, ['--pie', 'corto', '--ancho', '320', '--estricto', '--theme', 'claro']);
  assert.equal(m.lang, 'es'); assert.equal(m.theme, 'light');
  assert.equal(m.parts[0].caption, '*Semana*');
  assert.match(m.parts[0].fallback, /✅ Ventas: \*\$10\*/);
});

test('whatsapp: with a short caption the image carries only its text and the short version goes to fallback', () => {
  const md = `Subieron las visitas.\n\n${F}kpi "Semana"\n- Ventas: $10 (+2 %, ok)\n${F}\n\n${F}timeline "Plan"\n2026-11-04 | Pruebas | listo\n${F}`;
  const { parts, fallback } = plan(md, {}, { caption: 'short', lang: 'es' });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].caption, 'Subieron las visitas.');
  assert.match(parts[0].fallback, /^Subieron las visitas\.\n\n\*Semana\*\n✅ Ventas: \*\$10\*/);
  assert.equal(parts[1].caption, '*Plan*');
  assert.ok(!('title' in parts[1]));
  assert.match(fallback, /\*Plan\*\n- 4 nov: Pruebas \(listo\)$/);
  // By default nothing changes.
  assert.ok(!('fallback' in plan(md, {}, es).parts[0]));
});
