// WhatsApp adapter: a message with vis blocks -> parts, in order, ready to send through WhatsApp.
// Charts and cards go as phone-sized PNGs (drawn by `vis whatsapp`) with their short text version in the caption,
// in case the image does not load. Each decisions question goes as a poll when it fits WhatsApp's limits, and always
// also as numbered text for channels without polls. Invalid blocks and unsupported types stay as text.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vis = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vis.js'));

// WhatsApp limits: image caption 1024; poll with 2 to 12 distinct options, question 255 and option 100.
// More than 6 messages in a row from a bot already reads as a burst.
export const LIMITS = { caption: 1024, question: 255, option: 100, minOptions: 2, maxOptions: 12, messages: 6 };
// The same types as in a shared chat; decisions goes apart, as a poll and text.
export const AS_IMAGE = new Set(['chart', 'kpi', 'progress', 'timeline', 'compare']);

const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
// Cuts at whole lines.
function cutLines(s, n) {
  if (s.length <= n) return s;
  const out = [];
  for (const l of s.split('\n')) { if ([...out, l, '…'].join('\n').length > n) break; out.push(l); }
  return out.length ? out.join('\n') + '\n…' : cut(s, n);
}

// ---------- Markdown -> WhatsApp formatting ----------
// *bold*, _italic_, ~strike~, `code` and ``` blocks ```; tables go in monospace.
export function toWhatsApp(md) {
  const out = [];
  let table = [], inCode = false;
  const flushTable = () => { if (table.length) { out.push('```', ...table, '```'); table = []; } };
  for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) { flushTable(); inCode = !inCode; out.push('```'); continue; }
    if (inCode) { out.push(line); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table.push(line.trim()); continue; }
    flushTable();
    out.push(inlineWhatsApp(line));
  }
  flushTable();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function inlineWhatsApp(l) {
  const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(l);
  if (h) l = `**${h[1]}**`;
  l = l.replace(/^(\s*)[*+]\s+/, '$1- ');
  const codes = [];
  l = l.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  l = l.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => (t === u ? u : `${t} (${u})`))
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `\u0001${a || b}\u0001`)
    .replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1_$2_')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/\u0001/g, '*');
  return l.replace(/\u0000(\d+)\u0000/g, (_, i) => '`' + codes[i] + '`');
}

// ---------- Short version of each block (the image caption) ----------
// Dates as read in a chat: "May" or "Oct 1" ("may", "1 oct" in Spanish); the year only when it changes inside the
// block. The time stays.
const DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?/;
function xFormatter(d, lang) {
  if (!d.xDate) return v => v;
  const ds = d.values.map(r => DATE.exec(String(r[d.x])));
  if (ds.some(f => !f)) return v => v;
  const withYear = new Set(ds.map(f => f[1])).size > 1;
  return v => vis.shortDate(v, withYear, lang);
}
// Timeline status in captions: done, in progress and pending by name; anything else (late, blocked) as written.
function timelineStatus(s, lang) {
  const e = vis.TIMELINE_STATUS[String(s || '').toLowerCase()];
  return e && e !== 'bad' ? vis.statusLabel(e, lang, true) : s;
}
const change = (a, b) => (a ? `${b - a >= 0 ? '+' : ''}${Math.round((b - a) / Math.abs(a) * 100)} %` : null);
// One line per series. Over time: the last value and how much it changed since the first (and the peak if it was
// in between); by category: maximum and minimum.
function seriesSummary(name, rows, x, y, overTime, fx, lang) {
  const vals = rows.filter(r => r[y] != null);
  if (!vals.length) return null;
  const max = vals.reduce((a, r) => (r[y] > a[y] ? r : a)), min = vals.reduce((a, r) => (r[y] < a[y] ? r : a));
  const first = vals[0], last = vals[vals.length - 1];
  const N = vis.formatNumber;
  if (!overTime) return vis.t(lang, 'wa.maxMin', { name, max: N(max[y]), xmax: fx(max[x]), min: N(min[y]), xmin: fx(min[x]) });
  const c = vals.length > 1 ? change(first[y], last[y]) : null;
  const peak = max !== last && max !== first ? vis.t(lang, 'wa.peak', { v: N(max[y]), x: fx(max[x]) }) : '';
  return vis.t(lang, 'wa.last', { name, v: N(last[y]), x: fx(last[x]) }) + (c ? vis.t(lang, 'wa.since', { c, x: fx(first[x]) }) : '') + peak;
}
function chartLines(b, lang) {
  const d = vis.chartData(b, [], lang);
  if (!d) return [];
  const overTime = d.xDate || d.xNum, fx = xFormatter(d, lang), N = vis.formatNumber;
  if (d.kind === 'donut') {
    const y = d.ys[0], tot = d.values.reduce((s, r) => s + (r[y] || 0), 0) || 1;
    return d.values.map(r => `- ${r[d.x]}: ${N(r[y])} (${Math.round((r[y] || 0) / tot * 100)} %)`);
  }
  if (d.color) {
    const y = d.ys[0], groups = [...new Set(d.values.map(r => r[d.color]))];
    return groups.map(g => seriesSummary(g, d.values.filter(r => r[d.color] === g), d.x, y, overTime, fx, lang)).filter(Boolean);
  }
  // By category with few rows: every value.
  if (!overTime && d.values.length <= 6) return d.values.map(r => `- ${r[d.x]}: ${d.ys.map(y => `${d.ys.length > 1 ? y + ' ' : ''}${r[y] == null ? '-' : N(r[y])}`).join(' · ')}`);
  return d.ys.map(y => seriesSummary(y, d.values, d.x, y, overTime, fx, lang)).filter(Boolean);
}
// The status as an icon; the order is the image's so caption and image match.
const ICON = { bad: '❌', warn: '⚠️', ok: '✅' };
export function shortText(b, lang) {
  const title = b.type === 'chart' ? vis.chartTitle(b) : b.title;
  const l = [];
  switch (b.type) {
    case 'chart': l.push(...chartLines(b, lang)); break;
    case 'kpi':
      for (const x of vis.bodyLines(b.body).map(x => vis.parseKPI(x.text, lang)).filter(k => !k.error))
        l.push(`${ICON[x.status] || '-'} ${x.label}: *${x.value}*${x.delta ? ` (${x.delta})` : ''}`);
      break;
    case 'progress': {
      const { tasks, pct } = vis.progressData(b, lang);
      l.push(b.attrs.value != null && b.attrs.max != null ? vis.t(lang, 'wa.ofMax', { v: b.attrs.value, max: b.attrs.max, pct }) : `${pct} %`);
      for (const x of tasks) l.push(`- ${x.label}: ${vis.statusLabel(x.status, lang, true)}${x.status === 'progress' && x.pctGiven ? ` (${x.pct} %)` : ''}`);
      break;
    }
    case 'timeline': {
      const items = vis.bodyLines(b.body).map(x => vis.splitCells(x.text));
      const withYear = new Set(items.map(p => DATE.exec(p[0])?.[1])).size > 1;
      for (const p of items) l.push(`- ${vis.shortDate(p[0], withYear, lang)}: ${p[1]}${p[2] ? ` (${timelineStatus(p[2], lang)})` : ''}`);
      break;
    }
    case 'compare': {
      const A = b.attrs.before || vis.t(lang, 'wa.before'), D = b.attrs.after || vis.t(lang, 'wa.after');
      if (b.attrs.before || b.attrs.after) l.push(`${A} → ${D}`);
      for (const [m, x, y] of vis.bodyLines(b.body).map(x => vis.splitCells(x.text))) {
        const vx = vis.parseHumanNumber(x), vy = vis.parseHumanNumber(y);
        const c = vx != null && vy != null && vx !== 0 ? `, ${vy - vx > 0 ? '+' : ''}${Math.round((vy - vx) / Math.abs(vx) * 100)} %` : '';
        l.push(`- ${m}: ${x} → ${y}${c}`);
      }
      break;
    }
  }
  return cutLines([title ? `*${title}*` : '', ...l].filter(Boolean).join('\n'), LIMITS.caption);
}

// ---------- decisions: one part per question ----------
// First how to answer, then the options, with the number apart ("*1* · Nov 12") so it is not mixed with the text.
function inputText(e, alone, lang) {
  if (e.type === 'range') return vis.t(lang, 'wa.number', { min: e.min, max: e.max });
  if (alone && e.type === 'date') return vis.t(lang, 'wa.aDate');
  return vis.t(lang, e.type === 'date' ? 'wa.otherDate' : 'wa.yourAnswer');
}
function decisions(b, lang) {
  const T = (id, p) => vis.t(lang, id, p);
  const qs = vis.bodyLines(b.body).map(l => vis.parseDecision(l.text, lang)).filter(q => !q.error);
  return qs.map((q, i) => {
    const op = o => (o.other ? T('wa.writeIt', { label: o.label }) : `${o.label}${o.rec ? T('wa.recommended') : ''}${o.hint ? `: ${o.hint}` : ''}`);
    const n = q.options.length, other = q.options.some(o => o.other);
    const how = !n ? T('wa.replyWith', { x: inputText(q.input, true, lang) })
      : T('wa.replyWith', { x: q.multi ? T('wa.numbers') : T('wa.theNumber') }) + (q.input ? T('wa.orWrite', { x: inputText(q.input, false, lang) }) : other ? T('wa.orOwn') : '');
    const l = [
      i === 0 && b.title && b.title !== q.question ? `_${b.title}_` : '',
      qs.length > 1 ? T('wa.question', { i: i + 1, n: qs.length, q: q.question }) : `*${q.question}*`,
      `${how}${qs.length > 1 ? T('wa.quoting') : ''}:`,
      ...q.options.map((o, k) => `*${k + 1}* · ${op(o)}`),
    ].filter(Boolean);
    if (!n) l[l.length - 1] = l[l.length - 1].replace(/:$/, '.');
    const part = { type: 'poll', block: `decisions#${b.n}`, id: q.id, numbered: l.join('\n'), poll: null };
    if (n < LIMITS.minOptions || n > LIMITS.maxOptions) part.reason = n ? T('wa.pollRange', { n, min: LIMITS.minOptions, max: LIMITS.maxOptions }) : T('wa.noOptions');
    else {
      const options = q.options.map(o => cut(op(o), LIMITS.option));
      const free = q.input ? T('wa.or', { x: q.input.type === 'range' ? inputText(q.input, false, lang) : T(q.input.type === 'date' ? 'wa.writeOtherDate' : 'wa.writeAnswer') }) : '';
      if (new Set(options).size !== options.length) part.reason = T('wa.repeated');
      else part.poll = { question: cut(q.question + free, LIMITS.question), options, multiple: q.multi };
    }
    return part;
  });
}

// ---------- The whole message ----------
const blockSource = b => `${b.fence}\n${b.body}\n${/^[`~]+/.exec(b.fence)[0]}`;
const plain = s => s.replace(/\*([^*\n]+)\*/g, '$1');

// plan(md, engines, { caption, lang }) -> { parts, fallback, warnings }.
// engines: { vegaLite } so Vega-Lite warnings count as errors, as in `vis check`.
// caption: 'full' (default) puts the short text version of each image in its caption; 'short' keeps only the text
// next to it (or its title) and stores the short version in the part's `fallback`, to send only if the image fails.
// Image parts carry `source` (the block's Markdown) for the renderer; the CLI removes it from the manifest.
export function plan(md, engines = {}, { caption: captionMode = 'full', lang } = {}) {
  const short = captionMode === 'short';
  const ctx = { vegaLite: engines.vegaLite || null, lang };
  const parts = [], warnings = [];
  let text = [];
  const flush = () => { const x = toWhatsApp(text.join('\n')); if (x) parts.push({ type: 'text', text: x }); text = []; };
  for (const s of vis.parse(md)) {
    if (s.kind === 'md') { text.push(s.text); continue; }
    const id = `${s.type}#${s.n}`;
    const supported = AS_IMAGE.has(s.type) || s.type === 'decisions';
    const errs = [];
    if (!s.closed) errs.push({ message: vis.t(lang, 'wa.unclosed') });
    else if (supported) vis.validateBlock(s, errs, ctx);
    const withImages = s.type === 'compare' && vis.bodyLines(s.body).some(l => vis.splitCells(l.text).length === 2);
    if (errs.length || withImages || !supported) {
      const why = errs.length ? errs[0].message : withImages ? vis.t(lang, 'wa.compareImages') : vis.t(lang, 'wa.notDrawn', { type: s.type });
      warnings.push(vis.t(lang, 'wa.asText', { id, why }));
      text.push(vis.t(lang, 'wa.raw', { type: s.type }), '```', s.body, '```');
      continue;
    }
    flush();
    if (s.type === 'decisions') { parts.push(...decisions(s, lang)); continue; }
    const full = shortText(s, lang);
    const part = { type: 'image', block: id, caption: short ? '' : full, alt: s.type === 'chart' ? vis.chartAlt(s, lang) : plain(full), source: blockSource(s) };
    if (short) { part.fallback = full; part.title = s.type === 'chart' ? vis.chartTitle(s) : s.title; }
    parts.push(part);
  }
  flush();
  // A text followed by an image goes into that image's caption when it fits: one message less.
  for (let i = parts.length - 2; i >= 0; i--) {
    const [tx, im] = [parts[i], parts[i + 1]];
    if (tx.type === 'text' && im.type === 'image' && tx.text.length + im.caption.length + 2 <= LIMITS.caption) {
      im.caption = im.caption ? `${tx.text}\n\n${im.caption}` : tx.text;
      if (im.fallback) im.fallback = `${tx.text}\n\n${im.fallback}`;
      parts.splice(i, 1);
    }
  }
  for (const im of parts) if (im.type === 'image' && 'title' in im) { if (!im.caption && im.title) im.caption = `*${im.title}*`; delete im.title; }
  if (parts.length > LIMITS.messages) warnings.push(vis.t(lang, 'wa.tooMany', { n: parts.length }));
  const fallback = parts.map(p => (p.type === 'text' ? p.text : p.type === 'image' ? p.fallback || p.caption : p.numbered)).join('\n\n');
  return { parts, fallback, warnings };
}
