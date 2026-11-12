// Validator and renderer tests without a browser: each case says which code and line it expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
for (const f of ['vendor/vega-6.4.0.min.js', 'vendor/vega-lite-6.5.0.min.js'])
  new Function('module', 'exports', 'define', 'require', fs.readFileSync(path.join(ROOT, f), 'utf8')).call(globalThis);
const vis = require(path.join(ROOT, 'vis.js'));
const engines = { vega: globalThis.vega, vegaLite: globalThis.vegaLite };
const F = '```';
const chk = (md, lang, extra) => vis.check(md, Object.assign({ lang }, engines, extra));
function fails(md, code, line, inFix, lang, extra) {
  const r = chk(md, lang, extra);
  assert.equal(r.ok, false, 'should fail');
  const e = r.errors.find(x => x.code === code);
  assert.ok(e, `expected ${code}, got: ${r.errors.map(vis.formatError).join(' / ')}`);
  if (line != null) assert.equal(e.line, line, `line of ${code}`);
  if (inFix) assert.match(e.fix, inFix);
  return e;
}
const example = (f, lang) => fs.readFileSync(path.join(ROOT, 'examples', lang === 'es' ? 'es' : '', f + '.md'), 'utf8');

// [name, markdown, code, line, fix in English, fix in Spanish]
const cases = [
  ['unknown type with suggestion', `${F}chrat\nx,y\na,1\n${F}`, 'E_TYPE', 1, /chart/, /chart/],
  ['unclosed block', `text\n${F}kpi\n- A: 1`, 'E_UNCLOSED', 2, /```/, /```/],
  ['unclosed ~~~~ block names its own fence', `~~~~kpi\n- A: 1`, 'E_UNCLOSED', 1, /~~~~/, /~~~~/],
  ['unknown attribute with suggestion', `${F}kpi colz=3\n- A: 1\n${F}`, 'E_ATTR', 1, /cols=/, /cols=/],
  ['unknown chart kind', `${F}chart barr\nx,y\na,1\n${F}`, 'E_TYPE', 1, /bar/, /bar/],
  ['missing x field with suggestion', `${F}chart bar x=wek\nweek,v\nW1,1\n${F}`, 'E_FIELD', 1, /x=week/, /x=week/],
  ['row with extra cells', `${F}chart bar\ns,v\nS1,1\nS2,2,3\n${F}`, 'E_CSV_COLS', 4, /quote/, /comillas/],
  ['number with a unit', `${F}chart bar\ns,weight\nA,12 kg\n${F}`, 'E_CSV_NUM', 3, /unit=/, /unit=/],
  ['decimal comma', `${F}chart line\ns,v\nA,4,5\n${F}`, 'E_CSV_COLS', 3, null, null],
  ['quoted decimal comma', `${F}chart line\ns,v\nA,"4,5"\n${F}`, 'E_CSV_NUM', 3, /4\.5/, /4\.5/],
  ['thousands with a dot', `${F}chart bar\ns,v\nA,1.240\n${F}`, 'E_THOUSANDS', 3, /1240/, /1240/],
  ['quoted thousands with a comma', `${F}chart bar\ns,v\nA,"12,400"\n${F}`, 'E_THOUSANDS', 3, /12400/, /12400/],
  ['too many series', `${F}chart line\nm,a,b,c,d,e,f,g,h,i\n1,1,1,1,1,1,1,1,1,1\n${F}`, 'E_SERIES', 1, /Other/, /Otras/],
  ['too many rows', `${F}chart bar\ns,v\n${Array.from({ length: 501 }, (_, i) => `c${i},${i}`).join('\n')}\n${F}`, 'E_ROWS', 1, null, null],
  ['kpi separated with pipes', `${F}kpi\n- Revenue: $184,300 | +12 % | ok\n${F}`, 'E_LINE', 2, /Revenue: \$184,300 \(\+12 %, ok\)/, /Revenue: \$184,300 \(\+12 %, ok\)/],
  ['kpi without a colon', `${F}kpi\n- Revenue: 10\n- Errors 3\n${F}`, 'E_LINE', 3, /Label: value/, /Etiqueta: valor/],
  ['progress out of range', `${F}progress value=140\n${F}`, 'E_VALUE', 1, /0 and 100/, /0 y 100/],
  ['progress without a checkbox', `${F}progress\n- parser done\n${F}`, 'E_LINE', 2, /\[x\]/, /\[x\]/],
  ['impossible date', `${F}timeline\n2026-02-30 | Release | done\n${F}`, 'E_DATE', 2, /YYYY-MM-DD/, /AAAA-MM-DD/],
  ['unknown status', `${F}timeline\n2026-02-10 | Release | dnoe\n${F}`, 'E_STATUS', 2, /done/, /done/],
  ['unknown Spanish status', `${F}timeline\n2026-02-10 | Entrega | lsito\n${F}`, 'E_STATUS', 2, /listo/, /listo/],
  ['duplicate decision id', `${F}decisions\nside | Which side | A | B\nside | Again | C | D\n${F}`, 'E_ID_DUP', 3, /unique/, /unico/],
  ['decision without options', `${F}decisions\ndeadline | Date\n${F}`, 'E_LINE', 2, /deadline \| Due date/, /plazo \| Fecha limite/],
  ['unknown input', `${F}decisions\ndeadline | Date | @day\n${F}`, 'E_LINE', 2, /@date/, /@fecha/],
  ['vega-lite with broken JSON', `${F}vega-lite\n{"mark": "bar",}\n${F}`, 'E_JSON', 1, /JSON/, /JSON/],
  ['vega-lite with an invalid channel', `${F}vega-lite\n{"data":{"values":[{"a":1}]},"mark":"bar","encoding":{"colr":{"field":"a"}}}\n${F}`, 'E_VEGA', 1, null, null],
  ['vega-lite loading a URL', `${F}vega-lite\n{"data":{"url":"https://example.com/x.json"},"mark":"bar"}\n${F}`, 'E_REMOTE', 1, /data\.values/, /data\.values/],
  ['vega-lite with a link', `${F}vega-lite\n{"data":{"values":[{"a":"x","u":"javascript:alert(1)"}]},"mark":"bar","encoding":{"x":{"field":"a"},"href":{"field":"u"}}}\n${F}`, 'E_VEGA', 1, /href/, /href/],
  ['sheet image from a URL', `${F}sheet\nhttps://example.com/p.png?d=secret | x\n${F}`, 'E_REMOTE', 2, /relative/, /relativa/],
  ['compare image from a URL', `${F}compare\n//example.com/a.png | b.png\n${F}`, 'E_REMOTE', 2, /relative/, /relativa/],
  ['donut with a negative value', `${F}chart donut\nk,v\nA,3\nB,-1\n${F}`, 'E_VALUE', 4, /bar/, /bar/],
  ['empty block', `${F}kpi\n${F}`, 'E_EMPTY', 1, null, null],
  ['scatter with a text x', `${F}chart scatter\nname,v\nA,1\n${F}`, 'E_CSV_NUM', 1, /bar or line/, /bar o line/],
  ['malformed compare line', `${F}compare\nErrors | 31\n${F}`, 'E_LINE', 2, /Errors \| 31 \| 4/, /Errores \| 31 \| 4/],
  ['title without quotes', `${F}chart bar Monthly sales\ns,v\nA,1\n${F}`, 'E_ATTR', 1, /quotes/, /comillas/],
];
for (const [name, md, code, line, en, es] of cases) {
  test(`check: ${name}`, () => fails(md, code, line, en, 'en'));
  test(`check (es): ${name}`, () => fails(md, code, line, es, 'es'));
}

test('check: Spanish messages keep their wording', () => {
  const e = fails(`${F}chart bar\ns,v\nA,1.240\n${F}`, 'E_THOUSANDS', 3, null, 'es');
  assert.equal(vis.formatError(e), 'E_THOUSANDS|chart#1|3|"1.240" en v lleva separador de miles o es ambiguo|si son miles escribe 1240; si es decimal escribe 1.24');
  const k = fails(`${F}kpi\n- A: 1 (x, y, z)\n${F}`, 'E_LINE', 2, null, 'es');
  assert.equal(k.message, 'sobra "y" en el parentesis');
});
test('check: the library defaults to English', () => {
  const r = vis.check(`${F}kpi\n- A: 1 (x, y, z)\n${F}`);
  assert.equal(r.errors[0].message, 'unexpected "y" in the parentheses');
});
test('check: at most 5 errors and the real total', () => {
  const md = Array.from({ length: 8 }, (_, i) => `${F}kpi\n- no value ${i}\n${F}`).join('\n');
  const r = chk(md);
  assert.equal(r.errors.length, 5);
  assert.equal(r.total, 8);
});
test('check: regular code blocks are left alone', () => {
  const r = chk(`${F}js\nconst a = 1,240;\n${F}\n\n${F}\nno type\n${F}`);
  assert.equal(r.ok, true); assert.equal(r.blocks, 0);
});
test('check: every example passes in both languages', () => {
  for (const lang of ['en', 'es']) for (const f of ['bar', 'line', 'kpi', 'demo', 'decisions'])
    assert.equal(chk(example(f, lang), lang).ok, true, `${lang}/${f}`);
});
test('check: error line in the 5-field format', () => {
  const e = fails(`${F}chrat\n${F}`, 'E_TYPE', 1);
  assert.equal(vis.formatError(e).split('|').length, 5);
});
test('check: allowRemoteData lets a vega-lite URL through', () => {
  const r = chk(`${F}vega-lite\n{"data":{"url":"data.json"},"mark":"bar","encoding":{"x":{"field":"a"}}}\n${F}`, 'en', { allowRemoteData: true });
  assert.equal(r.errors.filter(e => e.code === 'E_REMOTE').length, 0);
});

// ---------- Parser and readers ----------
test('parse: CRLF line endings', () => {
  const r = chk(`${F}kpi\r\n- A: 1 (ok)\r\n${F}\r\n`);
  assert.equal(r.ok, true); assert.equal(r.blocks, 1);
  assert.equal(vis.parseKPI('- A: 1 (ok)').status, 'ok');
});
test('parse: a longer fence can hold a shorter one', () => {
  const s = vis.parse('````vega-lite\n{"description": "```"}\n```\n````\nafter');
  const b = s.find(x => x.kind === 'block');
  assert.equal(b.closed, true);
  assert.match(b.body, /^\{"description": "```"\}\n```$/);
  assert.equal(s[s.length - 1].text, 'after');
});
test('parse: block type aliases in English and Spanish', () => {
  const types = vis.parse(['grafica bar', 'kpis', 'progreso', 'linea', 'compara', 'decision', 'decisiones', 'vegalite', 'hoja'].map(t => `${F}${t}\nx\n${F}`).join('\n')).filter(s => s.kind === 'block').map(s => s.type);
  assert.deepEqual(types, ['chart', 'kpi', 'progress', 'timeline', 'compare', 'decisions', 'decisions', 'vega-lite', 'sheet']);
});
test('parseCSV: a quote opens a field only at its start; "" is a literal quote', () => {
  const [r] = vis.parseCSV('12" screen,"say ""hi""",x');
  assert.deepEqual(r.cells, ['12" screen', 'say "hi"', 'x']);
});
test('parseHumanNumber: thousands, decimals and the minus sign', () => {
  const N = vis.parseHumanNumber;
  assert.equal(N('4,2 s'), 4.2); assert.equal(N('1.240'), 1240); assert.equal(N('1,240'), 1240);
  assert.equal(N('1,234.56'), 1234.56); assert.equal(N('1.234,56'), 1234.56); assert.equal(N('−3'), -3);
  assert.equal(N('$184,300'), 184300); assert.equal(N('n/a'), null);
});
test('kpi status: canonical names and aliases', () => {
  for (const [x, code] of [['ok', 'ok'], ['warn', 'warn'], ['bad', 'bad'], ['alerta', 'warn'], ['mal', 'bad'], ['bien', 'ok']])
    assert.equal(vis.parseKPI(`- A: 1 (+2, ${x})`).status, code, x);
});
test('timeline status: canonical names and aliases', () => {
  const md = `${F}timeline\n${['done', 'in progress', 'pending', 'late', 'blocked', 'listo', 'hecho', 'en curso', 'curso', 'pendiente', 'atrasado', 'bloqueado'].map(s => `2026-01-01 | x | ${s}`).join('\n')}\n${F}`;
  assert.equal(chk(md).ok, true);
});
test('decisions: inputs and "other" options in both spellings', () => {
  const q = vis.parseDecision('a | Q | Yes | Other... | ... | Otra... | Something else… | @range 1-5');
  assert.deepEqual(q.options.map(o => [o.label, !!o.other]), [['Yes', false], ['Other', true], ['Other', true], ['Otra', true], ['Something else', true]]);
  assert.deepEqual(q.input, { type: 'range', min: 1, max: 5 });
  assert.equal(vis.parseDecision('a | Q | ...', 'es').options[0].label, 'Otra');
  for (const [x, type] of [['@date', 'date'], ['@fecha', 'date'], ['@text', 'text'], ['@texto', 'text'], ['@rango 0-10', 'range']])
    assert.equal(vis.parseDecision(`a | Q | ${x}`).input.type, type, x);
});

// ---------- Drawing without a browser ----------
test('text: bars as block characters with values', () => {
  const t = vis.toText(example('bar'));
  assert.match(t, /Web\s+█+.*1,?468/);
  assert.match(t, /Phone\s+█+.*341/);
});
test('text: lines as a table and sparklines', () => {
  const t = vis.toText(example('line'));
  assert.match(t, /\| month \| Site \| App \|/);
  assert.match(t, /Site: [▁-█]{10}/);
});
test('text: kpi keeps the values as written', () => {
  for (const lang of ['en', 'es']) {
    const t = vis.toText(example('kpi', lang), { lang });
    for (const v of ['$184,300', '1,240', '4.8 %', '6 h']) assert.ok(t.includes(`**${v}**`), v);
  }
  assert.match(vis.toText(example('kpi', 'es'), { lang: 'es' }), /\[alerta\]/);
  assert.match(vis.toText(example('kpi')), /\[warning\]/);
});
test('svg: colors stay as variables with a fallback', async () => {
  const svg = await vis.renderSVG(example('bar'), Object.assign({ theme: 'auto', width: 420 }, engines));
  assert.doesNotMatch(svg, /(fill|stroke)="#[0-9a-fA-F]{6}"/);
  assert.match(svg, /var\(--vis-s1,#0072B2\)/);
  assert.match(svg, /prefers-color-scheme: dark/);
});
test('svg: a fixed dark theme changes the colors (dark and oscuro)', async () => {
  for (const theme of ['dark', 'oscuro']) {
    const svg = await vis.renderSVG(example('bar'), Object.assign({ theme, width: 420 }, engines));
    assert.doesNotMatch(svg, /var\(--vis-/);
    assert.match(svg, /#56B4E9/);
  }
});
test('svg: month names follow the language, and the alt comes from the data', async () => {
  const es = await vis.renderHTML(example('line', 'es'), Object.assign({ width: 420, lang: 'es' }, engines));
  assert.match(es.html, />ene</); assert.match(es.html, />oct</);
  assert.match(es.alts[0], /Sitio: máximo 21\.2 en 2026-10/);
  const en = await vis.renderHTML(example('line'), Object.assign({ width: 420 }, engines));
  assert.match(en.html, />Jan</); assert.match(en.html, />Oct</);
  assert.match(en.alts[0], /^Line chart: Monthly visits/); assert.match(en.alts[0], /Site: max 21\.2 at 2026-10/);
});
test('html: Markdown lets no raw HTML through', async () => {
  const r = await vis.renderHTML('Hi <script>alert(1)</script> [x](javascript:alert(1))\n\n```kpi\n- <b>A</b>: <img src=x onerror=alert(1)>\n```', engines);
  assert.doesNotMatch(r.html, /<script|<img|javascript:|<b>/);
});
test('html: an html block is raw only with allowHTML', async () => {
  const md = '```html\n<img src=x onerror=alert(1)>\n```';
  assert.doesNotMatch((await vis.renderHTML(md, engines)).html, /<img/);
  assert.match((await vis.renderHTML(md, Object.assign({ allowHTML: true }, engines))).html, /<img src=x/);
});
test('html: vega-lite never fetches remote data by default', async () => {
  const md = '```vega-lite\n{"data":{"url":"https://example.invalid/x.json"},"mark":"bar","encoding":{"x":{"field":"a"}}}\n```';
  const r = await vis.renderHTML(md, engines);
  assert.equal(r.errors[0].code, 'E_REMOTE');
  assert.match(r.html, /vis-error/);
});
test('decisions: answer in one line', () => {
  assert.equal(vis.decisionAnswer('Course', [['Which side', 'Left'], ['Deadline', '2026-11-20']]), 'Course — Which side: Left · Deadline: 2026-11-20');
});
test('themes: series and text pass contrast against background and card', () => {
  for (const t of ['light', 'dark']) {
    const T = vis.THEMES[t];
    for (const c of T.s) for (const f of [T.bg, T.surface]) assert.ok(vis.contrast(c, f) >= 3, `${t} series ${c} on ${f}: ${vis.contrast(c, f).toFixed(2)}`);
    for (const k of ['text', 'text2', 'muted', 'ok', 'warn', 'bad', 'accent']) for (const f of [T.bg, T.surface]) assert.ok(vis.contrast(T[k], f) >= 4.5, `${t} ${k} on ${f}: ${vis.contrast(T[k], f).toFixed(2)}`);
  }
});
test('themes: each series text tone passes 4.5:1 and does not collide with the series', () => {
  for (const t of ['light', 'dark']) {
    const T = vis.THEMES[t];
    T.st.forEach(c => { for (const f of [T.bg, T.surface]) assert.ok(vis.contrast(c, f) >= 4.5, `${t} text ${c} on ${f}`); });
  }
  const c = vis.THEMES.light;
  for (const x of c.st) assert.ok(!c.s.includes(x), `repeated sentinel ${x}`);
});
test('static decisions: uses the number the question carries and leaves a line to write on', async () => {
  const es = await vis.renderHTML('```decisions "D"\na | 4c · ¿Subo? | Si | No\nb | ¿Nombre? | @texto\n```', Object.assign({ static: true, lang: 'es' }, engines));
  assert.match(es.html, /vis-num">4c</); assert.doesNotMatch(es.html, /4c ·/);
  assert.match(es.html, /vis-write/); assert.match(es.html, /4c A, 2 tu respuesta/);
  const en = await vis.renderHTML('```decisions "D"\na | 4c · Ship? | Yes | No\nb | Name? | @text\n```', Object.assign({ static: true }, engines));
  assert.match(en.html, /4c A, 2 your answer/); assert.match(en.html, /Reply in the chat/);
});
test('svg: a fixed dark theme also changes the series text tones', async () => {
  const svg = await vis.renderSVG(example('line'), Object.assign({ theme: 'dark', width: 420 }, engines));
  for (const c of vis.THEMES.light.st) assert.ok(!svg.includes(c), `light tone left ${c}`);
});
test('svg: with the interpreter (no new Function) the chart is the same', async () => {
  const dist = path.join(ROOT, 'clients/web/dist/vega-interpreter-2.3.2.browser.js');
  if (!fs.existsSync(dist)) return;
  // The file is a browser module; in Node (a CommonJS package) it loads as a data: URL.
  const { expressionInterpreter } = await import('data:text/javascript;base64,' + fs.readFileSync(dist).toString('base64'));
  for (const f of ['bar', 'line']) {
    const a = await vis.renderSVG(example(f), Object.assign({ width: 420 }, engines));
    const b = await vis.renderSVG(example(f), Object.assign({ width: 420, expr: expressionInterpreter }, engines));
    assert.equal(b, a, f);
  }
});
test('themes: themeFrom takes the page colors and recomputes the series text', async () => {
  const T = vis.themeFrom('light', { bg: '#FFFDF8', accent: '#9a5a00', s: ['#9A5A00'], text: 'red', grid: 'url(x)' });
  assert.equal(T.bg, '#FFFDF8'); assert.equal(T.accent, '#9A5A00'); assert.equal(T.s[0], '#9A5A00');
  assert.equal(T.text, vis.THEMES.light.text); assert.equal(T.grid, vis.THEMES.light.grid);
  assert.equal(T.s[1], vis.THEMES.light.s[1]);
  T.st.forEach(c => { for (const f of [T.bg, T.surface]) assert.ok(vis.contrast(c, f) >= 4.5, `text ${c} on ${f}`); });
  assert.equal(vis.themeFrom('oscuro', {}).bg, vis.THEMES.dark.bg);
  const svg = await vis.renderSVG(example('line'), Object.assign({ width: 420 }, engines));
  const painted = vis.applyTheme(svg, T, '-apple-system, "Segoe UI", sans-serif');
  assert.doesNotMatch(painted, /var\(--vis-/); assert.match(painted, /#9A5A00/);
  assert.match(painted, /font-family="-apple-system, 'Segoe UI', sans-serif"/);
  assert.equal(vis.applyTheme(svg, T, 'x"><script>'), vis.applyTheme(svg, T), 'an odd font does not get into the SVG');
});
test('words: the timeline says "in progress" and a finished task says "done"', async () => {
  const md = '```timeline\n2026-11-01 | Something | curso\n```\n\n```progress\n- [x] Done\n```';
  const en = await vis.renderHTML(md, engines);
  assert.match(en.html, /· in progress</); assert.match(en.html, /vis-task-pct">done</);
  const es = await vis.renderHTML(md, Object.assign({ lang: 'es' }, engines));
  assert.match(es.html, /· en curso</); assert.match(es.html, /vis-task-pct">listo</);
});
test('decisions: the box next to options says it is another date', async () => {
  const r = await vis.renderHTML('```decisions\nf | ¿Cuando? | 12 nov | @fecha\ng | ¿Dia? | @fecha\n```', Object.assign({ lang: 'es' }, engines));
  assert.equal((r.html.match(/<label class="vis-input-label"><span>Otra fecha<\/span><input type="date"/g) || []).length, 1);
  const en = await vis.renderHTML('```decisions\nf | When? | Nov 12 | @date\n```', engines);
  assert.match(en.html, /<span>Other date<\/span>/);
});
test('decisions: the form carries its labels for the standalone script', async () => {
  const r = await vis.renderHTML('```decisions\nf | When? | A | B\n```', Object.assign({ lang: 'es' }, engines));
  assert.match(r.html, /data-title="Decisiones"/); assert.match(r.html, /data-copy="Copiar respuesta"/); assert.match(r.html, /data-copied="Copiada"/);
});
test('css: data-theme accepts light/dark and claro/oscuro', () => {
  const c = vis.css({ theme: 'auto' });
  for (const x of ['light', 'claro']) assert.ok(c.includes(`:not([data-theme=${x}])`), x);
  for (const x of ['dark', 'oscuro']) assert.ok(c.includes(`:root[data-theme=${x}] .vis-doc`), x);
});
test('t: interpolates parameters and falls back to English', () => {
  assert.equal(vis.t('es', 'err.tooManyRows', { n: 3, max: 2 }), '3 filas; el tope es 2');
  assert.equal(vis.t('fr', 'err.tooManyRows', { n: 3, max: 2 }), '3 rows; the limit is 2');
  for (const k of Object.keys(vis.STRINGS.en)) assert.ok(k in vis.STRINGS.es, `missing es string ${k}`);
  for (const k of Object.keys(vis.STRINGS.es)) assert.ok(k in vis.STRINGS.en, `missing en string ${k}`);
});

test('the ESM entry exports every API name of vis.js', async () => {
  const esm = await import('../index.mjs');
  const cjs = require('../vis.js');
  assert.deepEqual(Object.keys(esm).filter(k => k !== 'default').sort(), Object.keys(cjs).sort());
  assert.equal(esm.default, cjs);
});

test('remote images are allowed with allowRemoteData, and data: images always', () => {
  const md = '```sheet\nhttps://example.com/p.png | x\ndata:image/png;base64,AAAA | y\n```';
  assert.equal(vis.check(md).errors.length, 1);
  assert.equal(vis.check(md, { allowRemoteData: true }).ok, true);
});

test('a vega-lite href never reaches the renderer', async () => {
  const md = '```vega-lite\n{"data":{"values":[{"a":"x","b":1,"u":"https://example.com"}]},"mark":"bar","encoding":{"x":{"field":"a","type":"nominal"},"y":{"field":"b","type":"quantitative"},"href":{"field":"u"}}}\n```';
  const r = await vis.renderHTML(md, { vega: globalThis.vega, vegaLite: globalThis.vegaLite });
  assert.equal(r.errors[0].code, 'E_VEGA');
  assert.doesNotMatch(r.html, /<svg/);
});

test('Markdown links stay linear on hostile input', () => {
  const t0 = performance.now();
  vis.markdownToHTML('['.repeat(50000) + '](' + 'a'.repeat(50000));
  assert.ok(performance.now() - t0 < 500);
});

test('ordinary code fences are left alone; near misses of VIS types are flagged', () => {
  for (const lang of ['shell', 'csharp', 'compose', 'chartjs', 'progressbar', 'python', 'timelines-js'])
    assert.equal(vis.check('```' + lang + '\nx\n```').ok, true, lang);
  for (const [typo, fix] of [['chrat', 'chart'], ['timline', 'timeline'], ['mermiad', 'mermaid'], ['decsions', 'decisions'], ['progres', 'progress']]) {
    const r = vis.check('```' + typo + '\nx\n```');
    assert.equal(r.errors[0].code, 'E_TYPE', typo);
    assert.match(r.errors[0].fix, new RegExp(fix));
  }
});

test('image URLs hidden with characters browsers ignore are still remote', () => {
  for (const p of ['h\tttps://example.com/a.png', '\u0001https://example.com/a.png', ' /\\example.com/a.png', 'HTTPS://example.com/a.png'])
    assert.equal(vis.check('```sheet\n' + p + ' | x\n```').errors[0]?.code, 'E_REMOTE', JSON.stringify(p));
});

test('vega-lite: specs nested too deep are rejected, and drawing errors become E_VEGA', async () => {
  let spec = { mark: { type: 'bar', href: 'https://example.com' }, data: { values: [{ a: 1 }] }, encoding: { x: { field: 'a', type: 'quantitative' } } };
  for (let i = 0; i < 21; i++) spec = { layer: [spec] };
  const deep = '```vega-lite\n' + JSON.stringify(spec) + '\n```';
  assert.equal(vis.check(deep, { vegaLite: globalThis.vegaLite }).errors[0].code, 'E_VEGA');
  const engines = { vega: globalThis.vega, vegaLite: globalThis.vegaLite };
  const shape = '```vega-lite\n{"data":{"values":[{"a":1,"b":2}]},"mark":"point","encoding":{"x":{"field":"a","type":"quantitative"},"y":{"field":"b","type":"quantitative"},"shape":{"value":"M0,0 Qx"}}}\n```';
  const r = await vis.renderHTML(shape, engines);
  assert.equal(r.errors[0].code, 'E_VEGA');
  assert.match(r.html, /<pre><code>/);
});

test('grouped bars with value labels keep the largest-first order', async () => {
  const md = `${F}chart bar "Signups" labels=true\nweek,A,B\nW1,10,12\nW2,30,28\nW3,20,25\n${F}`;
  assert.equal(chk(md, 'en').ok, true, chk(md, 'en').errors.map(vis.formatError).join(' / '));
  const spec = vis.chartToVegaLite(vis.parse(md).find(b => b.type === 'chart'), { width: 360 });
  assert.deepEqual(spec.layer[0].encoding.x.sort, ['W2', 'W3', 'W1']);
  const svg = await vis.renderSVG(md, Object.assign({ width: 360 }, engines));
  assert.match(svg, /<svg/);
});
