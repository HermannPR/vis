#!/usr/bin/env node
// Checks that every file in vendor/ matches the SHA-256 recorded in THIRD_PARTY_NOTICES.md.
// Run it after upgrading an engine; CI runs it on every push.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notices = fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const expected = new Map();
for (const m of notices.matchAll(/^\|\s*`(vendor\/[^`]+)`.*?\|\s*`sha256-([A-Za-z0-9+/=]+)`\s*\|\s*$/gm)) expected.set(m[1], m[2]);

let failed = 0;
const present = fs.readdirSync(path.join(ROOT, 'vendor')).map(f => `vendor/${f}`);
for (const f of present) {
  const want = expected.get(f);
  if (!want) { console.error(`missing from THIRD_PARTY_NOTICES.md: ${f}`); failed++; continue; }
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('base64');
  if (got !== want) { console.error(`hash mismatch: ${f}\n  expected ${want}\n  got      ${got}`); failed++; }
  else console.log(`ok  ${f}`);
}
for (const f of expected.keys()) if (!present.includes(f)) { console.error(`listed but not in vendor/: ${f}`); failed++; }
process.exit(failed ? 1 : 0);
