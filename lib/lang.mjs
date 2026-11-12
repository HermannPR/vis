// Language of the messages vis prints: 'en' or 'es'.
// Order: the explicit value (--lang), VIS_LANG, the POSIX locale variables (LC_ALL, LC_MESSAGES, LANG), the macOS
// preferred language (Node's Intl ignores it when no LANG is set), then Intl. Anything starting with "es" is Spanish;
// everything else is English.
import { execFileSync } from 'node:child_process';

const pick = x => (/^es([_-]|\b|$)/i.test(String(x || '').trim()) ? 'es' : 'en');

function macLanguage() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('defaults', ['read', '-g', 'AppleLanguages'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 });
    const m = /"?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)"?/.exec(out.replace(/^\s*\(\s*/, ''));
    return m ? m[1] : null;
  } catch { return null; }
}

export function detectLang(explicit, env = process.env) {
  if (explicit) return pick(explicit);
  if (env.VIS_LANG) return pick(env.VIS_LANG);
  for (const k of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const v = env[k];
    if (v && v !== 'C' && v !== 'POSIX' && !/^C\./.test(v)) return pick(v);
  }
  const mac = macLanguage();
  if (mac) return pick(mac);
  try { return pick(Intl.DateTimeFormat().resolvedOptions().locale); } catch { return 'en'; }
}
