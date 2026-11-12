// Claude widget hook adapter: run like the real hook, through stdin and stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'adapters', 'claude-widget-hook.mjs');
const F = '```';
const run = (tool_name, widget_code, lang = 'en') => {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input: { title: 't', loading_messages: ['x'], widget_code } }),
    encoding: 'utf8', env: { ...process.env, VIS_LANG: lang },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const MD = `# Hello\n\n${F}chart bar "Sales"\nmonth,v\nJan,3\nFeb,5\n${F}\n\n${F}decisions "D"\na | Keep going? | Yes* | No\n${F}`;

test('widget hook: vis Markdown is replaced by its drawing', () => {
  const h = run('mcp__visualize__show_widget', MD);
  assert.equal(h.permissionDecision, 'allow');
  const w = h.updatedInput.widget_code;
  assert.match(w, /^<style>/); assert.match(w, /<svg/); assert.match(w, /sendPrompt/); assert.match(w, /Send answer/);
  assert.doesNotMatch(w, /<!doctype|<html|<body/i);
  assert.equal(h.updatedInput.title, 't');
});
test('widget hook: Spanish labels with VIS_LANG=es', () => {
  const w = run('mcp__visualize__show_widget', MD, 'es').updatedInput.widget_code;
  assert.match(w, /Enviar respuesta/);
});
test('widget hook: errors deny and say what to fix, with the same code in both languages', () => {
  for (const lang of ['en', 'es']) {
    const h = run('mcp__visualize__show_widget', `${F}chart barr\nx,y\na,1\n${F}`, lang);
    assert.equal(h.permissionDecision, 'deny');
    assert.match(h.permissionDecisionReason, /E_TYPE/);
  }
});
test('widget hook: SVG, HTML and other tools pass untouched', () => {
  assert.equal(run('mcp__visualize__show_widget', '<svg viewBox="0 0 10 10"></svg>'), null);
  assert.equal(run('mcp__visualize__show_widget', 'text without blocks'), null);
  assert.equal(run('Bash', `${F}kpi\n- A: 1\n${F}`), null);
});
