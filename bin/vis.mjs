#!/usr/bin/env node
// vis command line: checks and draws the visual blocks of an agent's Markdown. `vis help` lists the commands.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, load, capture, splitCards, showCard } from '../lib/browser.mjs';
import { detectLang } from '../lib/lang.mjs';
import { loadEngines } from '../lib/engines.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vis = require(path.join(ROOT, 'vis.js'));
const VENDOR = {
  vega: path.join(ROOT, 'vendor/vega-6.4.0.min.js'),
  vegaLite: path.join(ROOT, 'vendor/vega-lite-6.5.0.min.js'),
  inter: path.join(ROOT, 'vendor/inter-latin-wght-normal-5.3.0.woff2'),
};

// Mermaid is optional and not bundled (its build carries many third-party licenses): VIS_MERMAID points at a
// mermaid.min.js file, otherwise the `mermaid` package is looked up from the current folder and from VIS itself.
// Without it, mermaid blocks render as code with an E_ENGINE note.
function findMermaid() {
  if (process.env.VIS_MERMAID) return fs.existsSync(process.env.VIS_MERMAID) ? process.env.VIS_MERMAID : null;
  for (const from of [path.join(process.cwd(), 'noop.js'), path.join(ROOT, 'noop.js')]) {
    try { return createRequire(from).resolve('mermaid/dist/mermaid.min.js'); } catch { }
  }
  return null;
}


// ---------- Arguments ----------
// kind: bool (no value), value (always takes one) or optional (takes the next argument only when it is a number).
// The Spanish names of earlier versions keep working as aliases.
const FLAGS = {
  to: { kind: 'value' }, theme: { kind: 'value' }, width: { kind: 'value', alias: ['ancho'] }, out: { kind: 'value', short: 'o' },
  block: { kind: 'value' }, split: { kind: 'optional', alias: ['partir'] }, force: { kind: 'bool', alias: ['forzar'] },
  strict: { kind: 'bool', alias: ['estricto'] }, 'no-font': { kind: 'bool', alias: ['sin-fuente'] },
  'max-height': { kind: 'value', alias: ['alto-max'] }, caption: { kind: 'value', alias: ['pie'] }, lang: { kind: 'value' },
  json: { kind: 'bool' }, 'allow-html': { kind: 'bool' }, help: { kind: 'bool', short: 'h' },
};
const BY_NAME = {};
for (const [k, f] of Object.entries(FLAGS)) { BY_NAME['--' + k] = k; for (const a of f.alias || []) BY_NAME['--' + a] = k; if (f.short) BY_NAME['-' + f.short] = k; }
const SPANISH_ALIASES = new Set(Object.values(FLAGS).flatMap(f => f.alias || []).map(a => '--' + a));
const VALUE_ALIASES = { caption: { corto: 'short', completo: 'full' }, theme: { claro: 'light', oscuro: 'dark' } };

class UsageError extends Error { }

function parseArgs(argv) {
  const o = { _: [], spanish: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-')) { o._.push(a); continue; }
    if (a === '--') { o._.push(...argv.slice(i + 1)); break; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const k = BY_NAME[flag];
    if (!k) throw new UsageError(JSON.stringify({ id: 'cli.unknownFlag', flag }));
    if (SPANISH_ALIASES.has(flag)) o.spanish = true;
    const f = FLAGS[k];
    let v;
    if (eq > 0) v = a.slice(eq + 1);
    else if (f.kind === 'bool') v = true;
    else if (f.kind === 'optional') v = argv[i + 1] != null && /^\d+$/.test(argv[i + 1]) ? argv[++i] : true;
    else { v = argv[i + 1]; if (v == null || (v.startsWith('-') && v !== '-')) throw new UsageError(JSON.stringify({ id: 'cli.needsValue', flag })); i++; }
    if (VALUE_ALIASES[k] && VALUE_ALIASES[k][v]) { o.spanish = o.spanish || k === 'caption'; v = VALUE_ALIASES[k][v]; }
    o[k] = v;
  }
  return o;
}

function oneOf(o, k, list) {
  if (o[k] != null && !list.includes(o[k])) throw new UsageError(JSON.stringify({ id: 'cli.badValue', flag: '--' + k, v: o[k], list: list.join(', ') }));
}
function positiveNumber(o, k) {
  if (o[k] == null) return null;
  const v = Number(o[k]);
  if (!(v > 0)) throw new UsageError(JSON.stringify({ id: 'cli.badValue', flag: '--' + k, v: o[k], list: '> 0' }));
  return v;
}

// ---------- Help ----------
const HELP = {
  en: {
    main: `vis ${vis.VERSION}: checks and draws the visual blocks (chart, kpi, progress, timeline, compare, decisions,
sheet, mermaid, vega-lite) of a Markdown document.

Usage: vis <command> [file|-] [options]      (no file or - reads standard input)

Commands:
  check      validate the blocks; one error per line: code|block|line|message|fix
  render     draw to html, png, svg or text
  audit      draw in light and dark in a headless browser and list layout problems (alias: chequear)
  whatsapp   one PNG per block plus manifest.json, ready to send through WhatsApp
  version    print the version
  help       this help; vis help <command> shows the options of one command

Common options:
  --lang en|es   language of messages and labels (default: VIS_LANG, else the system locale)
  -h, --help     help for the command

Exit codes: 0 ok; 1 invalid input or usage; 2 the audit found problems (audit always; render and whatsapp
with --strict).

PNG, audit and whatsapp need Chrome, Brave or Chromium; set VIS_CHROME to its path if it is not found.`,
    check: `Usage: vis check [file|-] [--json] [--lang en|es]

Validates every block. Prints "ok: N block(s), no errors" or one error per line: code|block|line|message|fix.
  --json   print the whole result as JSON: { ok, total, errors: [{ code, block, line, message, fix }], blocks }`,
    render: `Usage: vis render [file|-] --to html|png|svg|text [options]

  --to html|png|svg|text   output format (default html)
  -o, --out <file>         output file, or - for stdout (default: the input name with the new extension; stdout for stdin)
  --theme light|dark|auto  colors (default auto; png needs light or dark, and defaults to light)
  --width <px>             drawing width in CSS px (html and svg 640, png 390)
  --block <n>              svg only: draw block number n (default: the first chart or vega-lite)
  --split [px]             png only: cut into cards of at most px pixels high (default 1600)
  --strict                 png only: exit 2 when the audit finds problems
  --force                  draw even if check finds errors (invalid blocks show as an error box)
  --no-font                html only: do not embed the Inter font
  --allow-html             insert \`\`\`html blocks raw (trusted input only; otherwise they show as code)`,
    audit: `Usage: vis audit [file|-] [--width 390] [--lang en|es]

Draws the document in light and dark at a phone width and checks overflow, font size, contrast, overlapping
labels, KPI values and chart alt text. Prints code|where|detail per problem and exits 2 when there are any.`,
    whatsapp: `Usage: vis whatsapp [file|-] -o <dir> [options]

Writes one PNG per visual block and manifest.json (format vis-whatsapp/2) with the parts in order.
  -o, --out <dir>       output directory (required)
  --theme light|dark    colors (default light)
  --width <px>          CSS width of the images (default 320; the PNG is always 1080 px wide)
  --max-height <px>     taller images are cut into cards (default 1600)
  --caption full|short  full: each image caption carries its text version; short: only the title, with the
                        text version kept as the part's fallback (default full)
  --strict              exit 2 when the audit finds problems`,
  },
  es: {
    main: `vis ${vis.VERSION}: valida y dibuja los bloques visuales (chart, kpi, progress, timeline, compare, decisions,
sheet, mermaid, vega-lite) de un Markdown.

Uso: vis <comando> [archivo|-] [opciones]      (sin archivo o con - lee la entrada estandar)

Comandos:
  check      valida los bloques; un error por linea: codigo|bloque|linea|mensaje|arreglo
  render     dibuja en html, png, svg o text
  audit      dibuja en claro y oscuro en un navegador sin ventana y lista los problemas (alias: chequear)
  whatsapp   un PNG por bloque y manifest.json, listos para mandar por WhatsApp
  version    muestra la version
  help       esta ayuda; vis help <comando> muestra las opciones de un comando

Opciones comunes:
  --lang en|es   idioma de mensajes y etiquetas (por omision: VIS_LANG, si no el idioma del sistema)
  -h, --help     ayuda del comando

Codigos de salida: 0 ok; 1 entrada o uso invalido; 2 los chequeos encontraron problemas (audit siempre;
render y whatsapp con --strict).

PNG, audit y whatsapp necesitan Chrome, Brave o Chromium; si no lo encuentra, pon su ruta en VIS_CHROME.`,
    check: `Uso: vis check [archivo|-] [--json] [--lang en|es]

Valida cada bloque. Imprime "ok: N bloque(s) sin errores" o un error por linea: codigo|bloque|linea|mensaje|arreglo.
  --json   imprime el resultado completo en JSON: { ok, total, errors: [{ code, block, line, message, fix }], blocks }`,
    render: `Uso: vis render [archivo|-] --to html|png|svg|text [opciones]

  --to html|png|svg|text   formato de salida (html por omision)
  -o, --out <archivo>      archivo de salida, o - para stdout (por omision: el nombre de la entrada con la nueva extension)
  --theme light|dark|auto  colores (auto por omision; png necesita light o dark, y usa light por omision)
  --width <px>             ancho del dibujo en px CSS (html y svg 640, png 390)
  --block <n>              solo svg: dibuja el bloque numero n (por omision: el primer chart o vega-lite)
  --split [px]             solo png: parte en tarjetas de hasta px pixeles de alto (1600 por omision)
  --strict                 solo png: sale con 2 si los chequeos encuentran problemas
  --force                  dibuja aunque check encuentre errores (los bloques invalidos salen como aviso)
  --no-font                solo html: no incrusta la letra Inter
  --allow-html             inserta los bloques \`\`\`html tal cual (solo entrada de confianza; si no, salen como codigo)`,
    audit: `Uso: vis audit [archivo|-] [--width 390] [--lang en|es]

Dibuja el documento en claro y oscuro a ancho de telefono y revisa desbordes, tamano de letra, contraste,
etiquetas encimadas, valores de kpi y texto alternativo. Imprime codigo|donde|detalle y sale con 2 si hay problemas.`,
    whatsapp: `Uso: vis whatsapp [archivo|-] -o <carpeta> [opciones]

Escribe un PNG por bloque visual y manifest.json (formato vis-whatsapp/2) con las partes en orden.
  -o, --out <carpeta>   carpeta de salida (obligatoria)
  --theme light|dark    colores (light por omision)
  --width <px>          ancho CSS de las imagenes (320 por omision; el PNG siempre mide 1080 px)
  --max-height <px>     las imagenes mas altas se parten en tarjetas (1600 por omision)
  --caption full|short  full: el pie de cada imagen lleva su version en texto; short: solo el titulo, y la
                        version en texto queda como respaldo de la parte (full por omision)
  --strict              sale con 2 si los chequeos encuentran problemas`,
  },
};

// ---------- Pages ----------
const read = f => (!f || f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));
const fontCSS = () => `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(VENDOR.inter).toString('base64')}) format('woff2')}`;
const hasMermaid = md => /^\s{0,3}(`{3,}|~{3,})\s*mermaid\b/m.test(md);

// width: the content width (the page adds 16 px of padding on each side). fixed: the viewport is exactly the page.
function pageCSS(theme, width, fixed) {
  const root = theme === 'auto'
    ? `:root{${vis.cssVars(vis.THEMES.light)}}@media (prefers-color-scheme: dark){:root{${vis.cssVars(vis.THEMES.dark)}}}`
    : `:root{${vis.cssVars(vis.THEMES[theme])}}`;
  return `${root}html,body{margin:0;background:var(--vis-bg)}${fixed ? '' : `.vis-doc{max-width:${width + 32}px;margin:0 auto}`}.vis-doc{padding:16px;box-sizing:border-box}.vis-doc>:first-child,.vis-doc>.vis-card+*{margin-top:0}.vis-doc>:last-child{margin-bottom:0}.vis-doc>.vis-block:last-child{margin-bottom:0}`;
}

function mermaidConfig(theme) {
  const T = vis.THEMES[theme === 'dark' ? 'dark' : 'light'];
  return { startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: vis.FONT_STACK, themeVariables: { darkMode: theme === 'dark', background: T.bg, primaryColor: T.surface, primaryTextColor: T.text, primaryBorderColor: T.axis, lineColor: T.axis, secondaryColor: T.grid, tertiaryColor: T.bg, textColor: T.text, noteBkgColor: T.surface, noteTextColor: T.text, fontSize: '14px' } };
}

// Page drawn inside Chromium (PNG, audit and HTML with mermaid). viewport = content width + 32.
// Relative image paths (sheet, compare) resolve against baseDir, the document's folder.
function browserPage(md, { theme, width, mermaid, isStatic, lang, allowHTML, baseDir }) {
  const src = f => `<script src="${vis.escapeHTML(pathToFileURL(f).href)}"></script>`;
  const opts = { width, static: !!isStatic, lang, allowHTML: !!allowHTML };
  return `<!doctype html><html lang="${lang}" data-theme="${theme}"><head><meta charset="utf-8"><base href="${vis.escapeHTML(pathToFileURL(path.join(baseDir || process.cwd(), '/')).href)}"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${fontCSS()}</style><style>${vis.css({ theme })}</style><style>${pageCSS(theme, width, true)}</style>
${src(VENDOR.vega)}${src(VENDOR.vegaLite)}${mermaid ? src(mermaid) : ''}${src(path.join(ROOT, 'vis.js'))}</head>
<body><main class="vis-doc" id="doc"></main>
<script>
const MD = ${JSON.stringify(md).replace(/</g, '\\u003c')};
(async () => {
  const t0 = performance.now();
  await document.fonts.load('15px Inter'); await document.fonts.ready;
  if (window.mermaid) mermaid.initialize(${JSON.stringify(mermaidConfig(theme))});
  const doc = document.getElementById('doc');
  const r = await vis.renderDocument(doc, MD, ${JSON.stringify(opts)});
  // Lazy images off screen would never load: load them all before measuring and capturing.
  await Promise.all([...doc.querySelectorAll('img')].map(i => { i.loading = 'eager'; return i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; }); }));
  await new Promise(requestAnimationFrame);
  // The HTML handed back is the rendered markup before activation, so the page that receives it can activate it again.
  const copy = doc.cloneNode(true);
  copy.querySelectorAll('[data-vis-active]').forEach(f => f.removeAttribute('data-vis-active'));
  copy.querySelectorAll('.vis-submit[disabled]').forEach(b => b.removeAttribute('disabled'));
  window.__vis = { ready: true, ms: Math.round(performance.now() - t0), errors: r.errors, alts: r.alts, audit: vis.auditDOM(doc, MD, { lang: ${JSON.stringify(lang)} }), html: copy.innerHTML };
})().catch(e => { window.__vis = { ready: true, fatal: String(e && e.stack || e) }; });
</script></body></html>`;
}

// Standalone HTML: CSS, font and the decisions script inside; no engines (charts are already SVG).
function standaloneHTML(body, { theme, title, font = true, lang, width }) {
  const script = `(function(){var decisionAnswer=${vis.decisionAnswer.toString()};var activateDecisions=${vis.activateDecisions.toString()};activateDecisions(document);})();`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${vis.escapeHTML(title || 'vis')}</title>
<style>${font ? fontCSS() : ''}${vis.css({ theme })}${pageCSS(theme, width, false)}</style></head>
<body><main class="vis-doc">${body}</main><script>${script}</script></body></html>`;
}

const titleOf = md => { const m = /^#\s+(.+)$/m.exec(md); return m ? m[1].trim() : null; };

async function drawInBrowser(md, { theme, width, browser, isStatic, lang, allowHTML, baseDir }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-page-'));
  const file = path.join(dir, 'page.html');
  const own = !browser;
  const cleanup = async tab => {
    if (tab) await tab.close();
    if (own && browser) await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    fs.writeFileSync(file, browserPage(md, { theme, width: width - 32, mermaid: hasMermaid(md) ? findMermaid() : null, isStatic, lang, allowHTML, baseDir }));
    browser = browser || await launch();
    const tab = await load(browser, file, { width, dpr: 1080 / width, dark: theme === 'dark' });
    if (tab.data.fatal) { await cleanup(tab); throw new Error(tab.data.fatal); }
    return { tab, data: tab.data, close: () => cleanup(tab) };
  } catch (e) { await cleanup(null); throw e; }
}

function printAudit(data, label, T) {
  const p = data.audit || [];
  if (!p.length) { process.stderr.write(T('cli.auditOk', { label }) + '\n'); return 0; }
  process.stderr.write(T('cli.auditProblems', { label, n: p.length }) + '\n' + p.slice(0, 20).map(x => `  ${x.code}|${x.where}|${x.detail}`).join('\n') + '\n');
  return p.length;
}

// ---------- Commands ----------
const COMMANDS = { check: 'check', render: 'render', audit: 'audit', chequear: 'audit', whatsapp: 'whatsapp', version: 'version', help: 'help' };

async function main(argv) {
  let o;
  const [first, ...rest] = argv;
  try { o = parseArgs(rest); } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    const i = rest.indexOf('--lang'), m = JSON.parse(e.message);
    const lang = detectLang(i >= 0 ? rest[i + 1] : null);
    process.stderr.write(vis.t(lang, m.id, m) + '\n' + (lang === 'es' ? 'vis help muestra las opciones' : 'vis help lists the options') + '\n');
    return 1;
  }
  // --lang wins, then VIS_LANG; the Spanish flag aliases of earlier versions mean Spanish; then the system.
  const lang = o.lang ? detectLang(o.lang) : process.env.VIS_LANG ? detectLang(null) : o.spanish ? 'es' : detectLang(null);
  const T = (id, p) => vis.t(lang, id, p);
  const H = HELP[lang];
  const out = s => process.stdout.write(s + '\n'), err = s => process.stderr.write(s + '\n');

  if (!first || first === '--help' || first === '-h') { out(H.main); return first ? 0 : 1; }
  if (first === '--version' || first === '-v') { out(vis.VERSION); return 0; }
  const cmd = COMMANDS[first];
  if (!cmd) { err(T('cli.unknownCommand', { cmd: first })); err(H.main); return 1; }
  if (cmd === 'version') { out(vis.VERSION); return 0; }
  if (cmd === 'help') { const c = COMMANDS[o._[0]]; out(c && H[c] ? H[c] : H.main); return 0; }
  if (o.help) { out(H[cmd] || H.main); return 0; }
  if (o._.length > 1) { err(T('cli.unknownCommand', { cmd: o._.slice(1).join(' ') })); err(H[cmd]); return 1; }
  try { return await run(cmd, o, lang, T, H, out, err); } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    const m = JSON.parse(e.message);
    err(T(m.id, m)); err(H[cmd]);
    return 1;
  }
}

async function run(cmd, o, lang, T, H, out, err) {
  oneOf(o, 'lang', ['en', 'es']);
  const f = o._[0];
  if ((!f || f === '-') && process.stdin.isTTY) { err(H[cmd]); return 1; }
  const md = read(f);
  const allowHTML = !!o['allow-html'];
  const baseDir = f && f !== '-' ? path.dirname(path.resolve(f)) : process.cwd();

  if (cmd === 'check') {
    const r = vis.check(md, Object.assign({ lang }, loadEngines()));
    if (o.json) out(JSON.stringify(r, null, 1));
    else if (r.ok) out(T('cli.ok', { n: r.blocks }));
    else out(r.errors.map(vis.formatError).join('\n') + (r.total > r.errors.length ? T('cli.more', { n: r.total - r.errors.length }) : ''));
    return r.ok ? 0 : 1;
  }

  if (cmd === 'render') {
    oneOf(o, 'to', ['html', 'png', 'svg', 'text']);
    oneOf(o, 'theme', ['light', 'dark', 'auto']);
    const to = o.to || 'html';
    const theme = o.theme || (to === 'png' ? 'light' : 'auto');
    const width = positiveNumber(o, 'width') || (to === 'png' ? 390 : 640);
    const chk = vis.check(md, Object.assign({ lang }, loadEngines()));
    if (!chk.ok && !o.force) { err(chk.errors.map(vis.formatError).join('\n')); return 1; }
    const ext = to === 'text' ? 'txt' : to;
    const target = o.out === '-' ? null : o.out || (f && f !== '-' ? f.replace(/\.(md|markdown|txt)$/i, '') + '.' + ext : null);
    if (target && f && f !== '-' && path.resolve(target) === path.resolve(f)) { err(T('cli.overwrite')); return 1; }
    const write = c => { if (target) { fs.writeFileSync(target, c); err(T('cli.done', { f: target })); } else process.stdout.write(c); };
    if (to === 'text') { write(vis.toText(md, { lang })); return 0; }
    if (to === 'svg') { write(await vis.renderSVG(md, Object.assign({ theme, width, lang, block: o.block ? Number(o.block) : null }, loadEngines()))); return 0; }
    if (to === 'html') {
      let body;
      if (hasMermaid(md) && findMermaid()) {
        const d = await drawInBrowser(md, { theme: theme === 'dark' ? 'dark' : 'light', width: width + 32, lang, allowHTML, baseDir });
        body = d.data.html; await d.close();
      } else {
        const r = await vis.renderHTML(md, Object.assign({ width, lang, allowHTML }, loadEngines()));
        if (r.errors.length) err(r.errors.map(vis.formatError).join('\n'));
        body = r.html;
      }
      write(standaloneHTML(body, { theme, title: titleOf(md), font: !o['no-font'], lang, width }));
      return 0;
    }
    // png
    if (theme === 'auto') { err(T('cli.pngTheme')); return 1; }
    if (!target) { err(T('cli.pngOut')); return 1; }
    const t0 = Date.now(), dpr = 1080 / width;
    // Nothing can be tapped in an image: decisions come out with letters to answer by chat.
    const d = await drawInBrowser(md, { theme, width, isStatic: true, lang, allowHTML, baseDir });
    let problems = 0;
    const names = [];
    try {
      problems = printAudit(d.data, theme, T);
      // --split cuts into cards of at most N px high (1600 by default, what WhatsApp does not downscale).
      const split = o.split ? (o.split === true ? 1600 : Number(o.split) || 1600) : 0;
      const total = split ? await splitCards(d.tab, { maxHeight: Math.floor(split / dpr) }) : 1;
      for (let i = 0; i < total; i++) {
        if (split) await showCard(d.tab, i);
        const png = await capture(d.tab, { width, dpr });
        const name = total > 1 ? target.replace(/(\.png)?$/i, `-${i + 1}.png`) : target;
        fs.writeFileSync(name, png);
        names.push(`${name} (${T('cli.fileSize', { w: png.readUInt32BE(16), h: png.readUInt32BE(20), b: png.length })})`);
      }
    } finally { await d.close(); }
    err(T('cli.pngDone', { files: names.join(', '), ms: d.data.ms, total: Date.now() - t0 }));
    return problems && o.strict ? 2 : 0;
  }

  if (cmd === 'whatsapp') {
    if (!o.out) { err(T('cli.waOut')); return 1; }
    oneOf(o, 'caption', ['full', 'short']);
    const theme = o.theme || 'light';
    if (theme !== 'light' && theme !== 'dark') { err(T('cli.waTheme')); return 1; }
    // The chat shows the image at about 260-300 pt: it is drawn at 320 CSS px (3.4x) so the text reads without opening it.
    const width = positiveNumber(o, 'width') || 320, dpr = 1080 / width, maxHeight = positiveNumber(o, 'max-height') || 1600;
    const { plan } = await import('../adapters/whatsapp.mjs');
    const p = plan(md, loadEngines(), { caption: o.caption || 'full', lang });
    fs.mkdirSync(o.out, { recursive: true });
    const t0 = Date.now();
    const browser = p.parts.some(x => x.type === 'image') ? await launch() : null;
    let n = 0, problems = 0;
    try {
      for (const part of p.parts) {
        if (part.type !== 'image') continue;
        // Each block on its own page; taller than maxHeight it is cut into cards and the caption goes on the first.
        const d = await drawInBrowser(part.source, { theme, width, browser, isStatic: true, lang, baseDir });
        try {
          problems += printAudit(d.data, `${theme} ${part.block}`, T);
          const total = await splitCards(d.tab, { maxHeight: Math.floor(maxHeight / dpr) });
          part.files = [];
          for (let i = 0; i < total; i++) {
            await showCard(d.tab, i);
            const png = await capture(d.tab, { width, dpr });
            const file = `${String(++n).padStart(2, '0')}-${part.block.replace('#', '')}${total > 1 ? `-${i + 1}` : ''}.png`;
            fs.writeFileSync(path.join(o.out, file), png);
            part.files.push({ file, caption: i === 0 ? part.caption : T('wa.cardOf', { i: i + 1, n: total }), width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length });
          }
        } finally { await d.close(); }
        delete part.source;
      }
    } finally { if (browser) await browser.close(); }
    const manifest = { format: 'vis-whatsapp/2', vis: vis.VERSION, lang, theme, width, parts: p.parts, fallback: p.fallback, warnings: p.warnings };
    const file = path.join(o.out, 'manifest.json');
    fs.writeFileSync(file, JSON.stringify(manifest, null, 1) + '\n');
    for (const a of p.warnings) err(T('cli.warning', { a }));
    err(T('cli.waDone', { f: file, n: p.parts.length, p: n, ms: Date.now() - t0 }));
    return problems && o.strict ? 2 : 0;
  }

  // audit
  const width = positiveNumber(o, 'width') || 390;
  const browser = await launch();
  let total = 0;
  try {
    for (const theme of ['light', 'dark']) {
      const d = await drawInBrowser(md, { theme, width, browser, lang, allowHTML, baseDir });
      try {
        total += printAudit(d.data, theme, T);
        if (d.data.errors && d.data.errors.length) { total += d.data.errors.length; err(d.data.errors.map(vis.formatError).join('\n')); }
      } finally { await d.close(); }
    }
  } finally { await browser.close(); }
  return total ? 2 : 0;
}

main(process.argv.slice(2)).then(c => process.exit(c), e => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
