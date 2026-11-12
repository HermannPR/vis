#!/usr/bin/env node
// PreToolUse hook for Claude's chat widget tool (mcp__visualize__show_widget).
// When widget_code carries Markdown with vis blocks instead of SVG or HTML, it is validated: with errors the call is
// denied with the error lines so the agent fixes them; when it passes, widget_code is replaced with the drawing
// (CSS + SVG + script). Decisions answer through the widget's sendPrompt. Every other call passes untouched.
// Register it with matcher "mcp__visualize__show_widget" and command "node <path to vis>/adapters/claude-widget-hook.mjs".
// Language of messages and labels: VIS_LANG, else the system locale.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEngines } from '../lib/engines.mjs';
import { detectLang } from '../lib/lang.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vis = require(path.join(ROOT, 'vis.js'));
const WIDTH = 640;


// Markdown with at least one vis block; a regular widget starts with < (SVG or HTML).
export function isVisMarkdown(code) {
  if (typeof code !== 'string' || /^\s*</.test(code)) return false;
  return vis.parse(code).some(s => s.kind === 'block');
}

export async function widgetFragment(md, engines, lang) {
  const r = await vis.renderHTML(md, Object.assign({ width: WIDTH, lang, submitLabel: vis.t(lang, 'hook.submit') }, engines));
  const script = `(function(){var decisionAnswer=${vis.decisionAnswer.toString()};var activateDecisions=${vis.activateDecisions.toString()};`
    + `activateDecisions(document,typeof sendPrompt==='function'?function(t){sendPrompt(t);}:null);})();`;
  // The widget sets the background and the mode: dark with data-mode="dark" on :root, or the system's when there is
  // no data-mode. vis follows the same rule and takes the host's text, border and font tokens.
  const sc = '.vis-doc', T = vis.THEMES;
  const host = x => `--vis-text:var(--text-primary,${x.text});--vis-text2:var(--text-secondary,${x.text2});--vis-muted:var(--text-muted,${x.muted});--vis-border:var(--border,${x.border});--vis-surface:var(--surface-1,${x.surface});--vis-bg:var(--surface-2,${x.bg})`;
  const dark = `${vis.cssVars(T.dark)};${host(T.dark)}`;
  const style = vis.css({ theme: 'light' })
    + `${sc}{${host(T.light)};background:transparent;padding:0;max-width:none;font-family:var(--font-sans),${vis.FONT_STACK}}`
    + `@media (prefers-color-scheme: dark){:root:not([data-mode=light]) ${sc}{${dark}}}:root[data-mode=dark] ${sc}{${dark}}`
    + `${sc} h1,${sc} h2,${sc} h3,${sc} .vis-title{font-weight:500}`
    + '.vis-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
  const summary = r.alts.length ? r.alts.join(' ') : vis.t(lang, 'hook.summary');
  return `<style>${style}</style><h2 class="vis-sr">${vis.escapeHTML(summary)}</h2>`
    + `<div class="vis-doc">${r.html}</div><script>${script}</script>`;
}

// handleHookInput(hook JSON) -> hook output, or null to let the call pass untouched.
export async function handleHookInput(input, lang = detectLang(null)) {
  const ti = input.tool_input || {};
  if (!/show_widget$/.test(input.tool_name || '') || !isVisMarkdown(ti.widget_code)) return null;
  const engines = loadEngines();
  const c = vis.check(ti.widget_code, Object.assign({ lang }, engines));
  if (!c.ok) {
    const lines = c.errors.map(vis.formatError).join('\n');
    const more = c.total > c.errors.length ? vis.t(lang, 'hook.more', { n: c.total - c.errors.length }) : '';
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: vis.t(lang, 'hook.errors', { lines }) + more } };
  }
  const widget_code = await widgetFragment(ti.widget_code, engines, lang);
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: Object.assign({}, ti, { widget_code }) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let s = '';
  process.stdin.on('data', d => { s += d; }).on('end', async () => {
    let j = {};
    try { j = JSON.parse(s); } catch { process.exit(0); }
    try {
      const r = await handleHookInput(j);
      if (r) process.stdout.write(JSON.stringify(r));
    } catch (e) {
      // If vis fails the widget passes as is: an adapter error never blocks the chat.
      process.stderr.write(`vis claude-widget-hook: ${e.message}\n`);
    }
    process.exit(0);
  });
}
