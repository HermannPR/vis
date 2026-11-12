// Headless Chromium over the DevTools protocol, without npm: Node 22+ only.
// The protocol runs over a pipe (--remote-debugging-pipe), so no port is opened and nothing else on the machine
// can attach. Finds Brave, Chrome or Chromium; VIS_CHROME wins when set.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function findBrowser() {
  const exe = process.env.VIS_CHROME || CANDIDATES.find(r => fs.existsSync(r));
  if (!exe) throw new Error('Chrome, Brave or Chromium not found; set its path in VIS_CHROME');
  return exe;
}

// Browsers still open when the process exits are killed and their profiles removed.
const live = new Set();
process.on('exit', () => { for (const b of live) b.kill(); });

// launch({ timeout }) -> { send(method, params, sessionId), close(), version }.
// timeout: milliseconds allowed for each protocol command (default 30 s).
export async function launch({ timeout = 30000 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-browser-'));
  let proc;
  const pending = new Map();
  let n = 0, dead = null;
  const entry = {
    kill() {
      try { proc && proc.exitCode == null && proc.kill('SIGKILL'); } catch { }
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }
      live.delete(entry);
    },
  };
  live.add(entry);
  const fail = err => {
    if (dead) return;
    dead = err;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); }
    pending.clear();
  };
  try {
    proc = spawn(findBrowser(), [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio',
      '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    proc.on('error', e => fail(new Error(`could not start the browser: ${e.message}`)));
    proc.on('exit', code => fail(new Error(`the browser exited (code ${code})`)));
    const input = proc.stdio[3], output = proc.stdio[4];
    input.on('error', () => { });
    let buf = '';
    output.setEncoding('utf8');
    output.on('data', chunk => {
      buf += chunk;
      let k;
      while ((k = buf.indexOf('\0')) >= 0) {
        const raw = buf.slice(0, k); buf = buf.slice(k + 1);
        let m; try { m = JSON.parse(raw); } catch { continue; }
        const p = m.id && pending.get(m.id);
        if (!p) continue;
        pending.delete(m.id); clearTimeout(p.timer);
        m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
      }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (dead) return reject(dead);
      const id = ++n;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: no answer in ${timeout / 1000} s`)); }, timeout);
      pending.set(id, { resolve, reject, timer, method });
      input.write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0');
    });
    const close = async () => {
      if (!dead) { try { await Promise.race([send('Browser.close'), sleep(1000)]); } catch { } }
      fail(new Error('the browser is closed'));
      // Wait for the process to end before removing the profile: Chrome keeps writing to it while it shuts down.
      if (proc.exitCode == null && proc.signalCode == null) await Promise.race([new Promise(r => proc.once('exit', r)), sleep(2000)]);
      entry.kill();
    };
    const ver = await send('Browser.getVersion');
    return { send, close, version: ver.product };
  } catch (e) {
    fail(e);
    entry.kill();
    throw e;
  }
}

// Opens a tab, loads an HTML file and waits for window.__vis.ready. Returns { send, targetId, data, close() }.
// The tab stays open for capture(); close it with tab.close() (browser.close() closes every tab).
export async function load(browser, file, { width = 390, height = 900, dpr = 1080 / 390, dark = false, timeout = 20000 } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const close = () => browser.send('Target.closeTarget', { targetId }).catch(() => { });
  try {
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => browser.send(m, p, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    await send('Page.navigate', { url: pathToFileURL(path.resolve(file)).href });
    const t0 = Date.now();
    let data = null;
    while (Date.now() - t0 < timeout) {
      const r = await send('Runtime.evaluate', { expression: 'window.__vis && window.__vis.ready ? JSON.stringify(window.__vis) : ""', returnByValue: true });
      if (r.result && r.result.value) { data = JSON.parse(r.result.value); break; }
      await sleep(30);
    }
    if (!data) throw new Error(`the page did not finish rendering in ${timeout / 1000} s`);
    return { send, targetId, data, close };
  } catch (e) {
    await close();
    throw e;
  }
}

// PNG capture (CSS width * dpr pixels): the whole page, or only clip { y, height } in CSS px.
export async function capture(tab, { width = 390, dpr = 1080 / 390, clip = null } = {}) {
  const { send } = tab;
  const r = await send('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.getBoundingClientRect().height)', returnByValue: true });
  const height = Math.max(1, r.result.value);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  const c = clip || { y: 0, height };
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: c.y, width, height: c.height, scale: 1 } });
  return Buffer.from(data, 'base64');
}

// Splits the page into cards of at most maxHeight CSS px, to send through a chat. The units are the blocks;
// a decisions block that does not fit in one card is split between questions (repeating its title and footer).
// Each card carries "title · n/N" at the top in 13 px because cards get forwarded alone; a heading never ends a
// card. Returns N; showCard(tab, k) leaves only card k visible so it can be captured whole.
export async function splitCards(tab, { maxHeight }) {
  const { send } = tab;
  await send('Emulation.setDeviceMetricsOverride', { width: (await send('Runtime.evaluate', { expression: 'innerWidth', returnByValue: true })).result.value, height: 200, deviceScaleFactor: 1, mobile: false });
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const doc = document.querySelector('.vis-doc'), maxHeight = ${Number(maxHeight)};
    const U = [];
    for (const c of [...doc.children]) {
      const qs = c.querySelectorAll('.vis-dec-static > .vis-q');
      if (qs.length > 1 && c.getBoundingClientRect().height > maxHeight - 32) qs.forEach(q => U.push({ el: q, fig: c }));
      else U.push({ el: c, h: /^H[1-6]$/.test(c.tagName) });
    }
    const h1 = doc.querySelector('h1'), title = h1 ? h1.textContent.trim() : '';
    const card = document.createElement('p'); card.className = 'vis-card'; card.innerHTML = '<span></span><span></span>';
    doc.prepend(card);
    const height = () => document.documentElement.getBoundingClientRect().height;
    const show = (g, n) => {
      for (const u of U) { u.el.style.display = 'none'; if (u.fig) u.fig.style.display = 'none'; }
      for (const i of g) { U[i].el.style.display = ''; if (U[i].fig) U[i].fig.style.display = ''; }
      card.firstChild.textContent = g.some(i => U[i].el === h1) ? '' : title;
      card.lastChild.textContent = n;
    };
    const G = [];
    for (let i = 0; i < U.length;) {
      const g = [i];
      for (let j = i + 1; j < U.length; j++) { show(g.concat(j), '10/10'); if (height() > maxHeight) break; g.push(j); }
      while (g.length > 1 && U[g[g.length - 1]].h) g.pop();
      G.push(g); i = g[g.length - 1] + 1;
    }
    window.__visCard = k => { show(G[k], G.length > 1 ? (k + 1) + '/' + G.length : ''); card.style.display = G.length > 1 ? '' : 'none'; };
    return G.length;
  })()` });
  return r.result.value;
}
export async function showCard(tab, k) {
  await tab.send('Runtime.evaluate', { expression: `window.__visCard(${Number(k)})` });
}
