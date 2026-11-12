// vis inside a web chat with a strict CSP (script-src 'self', style-src 'self', img-src 'self' blob:).
// The chat loads it with import() only when a message carries a block. Nothing relaxes the CSP:
// - scripts come from the same origin and Vega draws with the expression interpreter (no new Function);
// - the styles come from vis.css and the few inline styles go through CSSOM, from a closed list;
// - the DOM is built with createElement from a closed list of tags and attributes (no on*, href, src or id);
// - every chart goes in as <img src=blob:>, where an SVG runs no code and loads nothing.
// A block that does not pass check() or a type outside the list stays as text.
const HERE = new URL('.', import.meta.url)
const TYPES = ['chart', 'kpi', 'progress', 'timeline', 'compare', 'decisions']
// The block types and their aliases (English variants and Spanish names), as vis.js reads them.
const HAS = /^ {0,3}(`{3,}|~{3,})[ \t]*(chart|charts|graph|gr[aá]fica|gr[aá]fico|kpis?|progress|progreso|timeline|l[ií]nea|compare|comparar?|comparison|decisions?|decisiones)(?![\w-])/im
export const has = text => HAS.test(String(text || ''))

const loads = new Map()
function script(name) {
  if (!loads.has(name)) {
    loads.set(name, new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = new URL(name, HERE).href
      s.onload = resolve
      s.onerror = () => { loads.delete(name); reject(new Error(`could not load ${name}`)) }
      document.head.append(s)
    }))
  }
  return loads.get(name)
}
const base = () => script('vis.js').then(() => window.vis)
let engines = null
function withCharts() {
  engines ??= (async () => {
    await script('vega-6.4.0.min.js')
    await script('vega-lite-6.5.0.min.js')
    const { expressionInterpreter } = await import(new URL('vega-interpreter-2.3.2.browser.js', HERE).href)
    return { vega: window.vega, vegaLite: window.vegaLite, expr: expressionInterpreter }
  })().catch(e => { engines = null; throw e })
  return engines
}
let sheet = null
function stylesheet() {
  sheet ??= new Promise((resolve, reject) => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = new URL('vis.css', HERE).href
    l.onload = resolve
    l.onerror = () => { l.remove(); sheet = null; reject(new Error('could not load vis.css')) }
    document.head.append(l)
  })
  return sheet
}

// A chart is an image: it does not read the page's variables. It is painted with the --vis-* values the page gives
// .vis-doc and with its font, and repainted when the system switches between light and dark.
const dark = matchMedia('(prefers-color-scheme: dark)')
const TOKENS = ['bg', 'surface', 'text', 'text2', 'muted', 'border', 'grid', 'axis', 'ok', 'warn', 'bad', 'accent', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
// The browser returns the resolved color as rgb(...) or, when it comes from color-mix(), as color(srgb ...).
function toHex(css) {
  const m = /^(rgba?\(|color\(srgb\s+)([^)]*)\)$/.exec(css.trim())
  if (!m) return null
  const p = m[2].split(/[\s,/]+/).filter(Boolean).map(Number)
  const v = m[1].startsWith('color') ? p.slice(0, 3).map(x => x * 255) : p.slice(0, 3)
  if (v.length < 3 || v.some(x => !Number.isFinite(x)) || p[3] === 0) return null
  return '#' + v.map(x => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')
}
function pageTheme(doc) {
  const probe = document.createElement('span')
  probe.hidden = true
  doc.append(probe)
  const c = {}
  for (const k of TOKENS) { probe.style.setProperty('color', `var(--vis-${k}, transparent)`); c[k] = toHex(getComputedStyle(probe).color) }
  probe.remove()
  c.s = TOKENS.filter(k => /^s\d$/.test(k)).map(k => c[k])
  return { theme: window.vis.themeFrom(dark.matches ? 'dark' : 'light', c), font: getComputedStyle(doc).fontFamily }
}
const live = new Set()
function paint(d) {
  const { theme, font } = pageTheme(d.doc)
  for (const g of d.charts) {
    const before = g.img.src
    g.img.src = URL.createObjectURL(new Blob([window.vis.applyTheme(g.svg, theme, font)], { type: 'image/svg+xml' }))
    if (before) URL.revokeObjectURL(before)
  }
}
dark.addEventListener('change', () => {
  for (const d of live) {
    if (d.doc.isConnected) paint(d)
    else { for (const g of d.charts) URL.revokeObjectURL(g.img.src); live.delete(d) }
  }
})

// A kpi value is not broken ("$184,3|00"): when it does not fit the font shrinks down to 16 px, and only then wraps.
function fitKPI(doc) {
  for (const v of doc.querySelectorAll('.vis-kpi-value')) {
    for (const k of ['font-size', 'white-space', 'overflow-wrap']) v.style.removeProperty(k)
    let size = parseFloat(getComputedStyle(v).fontSize)
    while (v.scrollWidth > v.clientWidth + 1 && size > 16) v.style.setProperty('font-size', `${--size}px`)
    if (v.scrollWidth > v.clientWidth + 1) { v.style.setProperty('white-space', 'normal'); v.style.setProperty('overflow-wrap', 'anywhere') }
  }
}
const widths = new WeakMap()
let observer = null
const watchKPI = doc => (observer ??= new ResizeObserver(es => {
  for (const e of es) {
    const w = Math.round(e.contentRect.width)
    if (widths.get(e.target) !== w) { widths.set(e.target, w); fitKPI(e.target) }
  }
})).observe(doc)

// ---------- Copy of vis's HTML through a closed list ----------
const SVG = 'http://www.w3.org/2000/svg'
const TAGS = new Set('figure figcaption div p span b strong em ul ol li time table thead tbody tr th td form fieldset legend label button input textarea output br code pre'.split(' '))
const ICON_TAGS = new Set(['svg', 'path', 'circle', 'rect'])
const ATTRIBUTES = new Set(['class', 'role', 'scope', 'placeholder', 'hidden', 'min', 'max', 'step', 'value', 'rows',
  'datetime', 'aria-label', 'aria-hidden', 'aria-pressed', 'aria-live', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax',
  'data-title', 'data-question', 'data-multi', 'data-value', 'data-other', 'data-alt', 'data-empty', 'data-copy', 'data-copied'])
const SVG_ATTRIBUTES = {
  viewBox: /^[\d. -]+$/, 'aria-hidden': /^true$/, d: /^[\d\sMmLlHhVvCcSsQqTtAaZz.,-]+$/,
  fill: /^(none|currentColor)$/, stroke: /^(none|currentColor)$/, 'stroke-linecap': /^(round|butt|square)$/, 'stroke-linejoin': /^(round|miter|bevel)$/,
}
for (const k of ['cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'stroke-width']) SVG_ATTRIBUTES[k] = /^[\d.]+$/
const INPUT_TYPES = new Set(['button', 'text', 'date', 'range'])
const STYLES = { width: /^\d{1,3}(\.\d+)?%$/, 'text-align': /^(left|right|center)$/, 'grid-template-columns': /^repeat\(\d{1,2},minmax\(0,1fr\)\)$/ }
// For the test that compares the lists with what vis.js generates.
export const LISTS = { TAGS, ICON_TAGS, ATTRIBUTES, SVG_ATTRIBUTES, STYLES }

function copy(n, ctx) {
  if (n.nodeType === 3) return document.createTextNode(n.data)
  if (n.nodeType !== 1) return null
  const tag = n.localName
  if (tag === 'svg' && n.getAttribute('role') === 'img' && ctx.svg) return chartImage(n, ctx)
  if (tag === 'img') return document.createTextNode(n.getAttribute('alt') || '')
  const isSvg = n.namespaceURI === SVG
  if (isSvg ? !ICON_TAGS.has(tag) : !TAGS.has(tag)) return null
  const el = isSvg ? document.createElementNS(SVG, tag) : document.createElement(tag)
  for (const { name, value } of n.attributes) {
    if (isSvg) { if (SVG_ATTRIBUTES[name]?.test(value)) el.setAttribute(name, value); continue }
    if (name === 'data-style') {
      for (const d of value.split(';')) {
        const i = d.indexOf(':'), k = d.slice(0, i).trim(), v = d.slice(i + 1).trim()
        if (i > 0 && STYLES[k]?.test(v)) el.style.setProperty(k, v)
      }
    } else if (name === 'type') {
      if (INPUT_TYPES.has(value)) el.setAttribute('type', value)
    } else if (ATTRIBUTES.has(name)) el.setAttribute(name, value)
  }
  for (const h of n.childNodes) { const c = copy(h, ctx); if (c) el.append(c) }
  return el
}
function chartImage(n, ctx) {
  const img = document.createElement('img')
  img.className = 'vis-img'
  img.alt = n.getAttribute('aria-label') || window.vis.t(ctx.lang, 'alt.chart')
  if (ctx.onResize) img.addEventListener('load', ctx.onResize, { once: true })
  ctx.charts.push({ img, svg: ctx.svg })
  return img
}

const rawBlock = b => b.closed ? `${b.fence}\n${b.body}\n${/^[`~]+/.exec(b.fence)[0]}` : `${b.fence}\n${b.body}`
function paragraph(text) {
  const p = document.createElement('p')
  p.className = 'vis-text'
  p.textContent = text
  return p
}
// A block that is not drawn (another type, or one that does not pass check) shows as code, without fences and with
// its type on top.
function codeBox(s) {
  const pre = document.createElement('pre')
  pre.className = 'vis-raw'
  if (s.type) {
    const t = document.createElement('span')
    t.className = 'vis-raw-type'
    t.textContent = s.type
    pre.append(t)
  }
  const c = document.createElement('code')
  c.textContent = s.body
  pre.append(c)
  return pre
}

// bubble: the message balloon; body: where the text is. text: the message's Markdown.
// opts.lang: 'en' | 'es' (default: <html lang>, else the browser's language). opts.submitLabel: the decisions button.
// opts.fill(text) puts the decisions answer in the chat's input box; opts.onResize() runs when the balloon changes
// height (to stay scrolled to the bottom). If anything fails, the body stays as it was.
export async function mount(bubble, body, text, opts = {}) {
  if (!has(text)) return false
  const vis = await base()
  const lang = opts.lang || document.documentElement.lang || navigator.language || 'en'
  const segs = vis.parse(text)
  const usable = segs.filter(s => s.kind === 'block' && s.closed && TYPES.includes(s.type))
  if (!usable.length) return false
  const m = usable.some(s => s.type === 'chart') ? await withCharts() : {}
  // Even when no block is valid it is mounted anyway: each one shows as a code box, as in a balloon with charts.
  for (const s of usable) s.valid = vis.check(rawBlock(s), Object.assign({ lang }, m)).ok
  await stylesheet()
  bubble.classList.add('vis')
  try { return await build(vis, segs, m, body, Object.assign({}, opts, { lang })) } catch (e) { bubble.classList.remove('vis'); throw e }
}
async function build(vis, segs, m, body, opts) {
  const width = Math.max(240, Math.min(600, Math.floor(body.getBoundingClientRect().width) || 320))
  const doc = document.createElement('div')
  doc.className = 'vis-doc'
  const charts = []
  let loose = []
  const flush = () => {
    const t = loose.join('\n').replace(/^\n+|\s+$/g, '')
    if (t) doc.append(paragraph(t))
    loose = []
  }
  const submitLabel = opts.submitLabel || vis.t(opts.lang, 'client.submit')
  for (const s of segs) {
    if (s.kind === 'md') { loose.push(s.text); continue }
    const r = s.valid ? await vis.renderHTML(rawBlock(s), Object.assign({}, m, { width, lang: opts.lang, submitLabel })) : null
    flush()
    if (!r || r.errors.length) { doc.append(codeBox(s)); continue }
    // DOMParser inherits the CSP: a style="..." in the parsed text already counts as an inline style (and the CSP
    // reports it). So the chart is taken out first (leaving its empty <svg> with the alt) and style moves to data-style.
    const svg = s.type === 'chart' ? /<svg[\s\S]*<\/svg>/.exec(r.html)?.[0] : null
    let source = svg ? r.html.replace(svg, `<svg role="img" aria-label="${/^<svg[^>]*?\saria-label="([^"]*)"/.exec(svg)?.[1] || ''}"></svg>`) : r.html
    source = source.replace(/\sstyle="/g, ' data-style="')
    const html = new DOMParser().parseFromString(source, 'text/html')
    for (const n of html.body.childNodes) { const c = copy(n, { svg, charts, onResize: opts.onResize, lang: opts.lang }); if (c) doc.append(c) }
  }
  flush()
  body.replaceChildren(doc)
  // Colors and font are read with the block already on the page.
  if (charts.length) { const d = { doc, charts }; paint(d); live.add(d) }
  if (doc.querySelector('.vis-kpi-value')) watchKPI(doc)
  vis.activateDecisions(doc, t => opts.fill?.(t))
  for (const f of doc.querySelectorAll('form')) f.addEventListener('submit', e => e.preventDefault())
  opts.onResize?.()
  return true
}
