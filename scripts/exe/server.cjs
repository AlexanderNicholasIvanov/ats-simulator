// Desktop launcher for ATS Simulator, packed into a Windows .exe by scripts/build-exe.mjs.
// It serves the built app (dist/) on 127.0.0.1 only and opens it in the default browser.
// Inside the exe the files come from the embedded SEA assets; run directly with node it reads dist/.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const BASE = '/ats-simulator/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** The node:sea module when running inside the exe, else null. */
function seaModule() {
  try {
    const sea = require('node:sea');
    return sea.isSea() ? sea : null;
  } catch {
    return null;
  }
}

/** Load every file of the built app as { '/assets/x.js': Buffer }, keyed by path below BASE. */
function loadFiles(distDir) {
  const sea = seaModule();
  const files = new Map();
  if (sea) {
    const manifest = JSON.parse(sea.getAsset('manifest.json', 'utf8'));
    for (const key of manifest) files.set(key, Buffer.from(sea.getAsset(key)));
    return files;
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set('/' + path.relative(distDir, full).split(path.sep).join('/'), fs.readFileSync(full));
    }
  };
  walk(distDir);
  return files;
}

/** Request handler over an in-memory file map. Only GET/HEAD, only known files, nothing from disk. */
function createHandler(files) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    let p = url.pathname;
    if (p === '/' || p === BASE.slice(0, -1)) {
      res.writeHead(302, { Location: BASE }).end();
      return;
    }
    if (!p.startsWith(BASE)) {
      res.writeHead(404).end('Not found');
      return;
    }
    p = '/' + p.slice(BASE.length);
    if (p.endsWith('/')) p += 'index.html';
    const body = files.get(p);
    if (!body) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

function openBrowser(url) {
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], { windowsHide: true });
  else if (process.platform === 'darwin') execFile('open', [url]);
  else execFile('xdg-open', [url]);
}

/** Fetch the page and every file it needs from our own server; used by `--smoke` in CI. */
async function smoke(origin, files) {
  const keys = ['/index.html', ...[...files.keys()].filter((k) => k.startsWith('/assets/'))];
  for (const key of keys) {
    const r = await fetch(origin + BASE + key.slice(1));
    if (r.status !== 200) throw new Error(`${key}: HTTP ${r.status}`);
  }
  const worker = keys.find((k) => /pdf\.worker.*\.mjs$/.test(k));
  if (!worker) throw new Error('pdf.js worker missing from the bundle');
  const html = await (await fetch(origin + BASE)).text();
  if (!html.includes('/ats-simulator/assets/')) throw new Error('index.html does not reference the bundled assets');
  return keys.length;
}

function main() {
  const smokeMode = process.argv.includes('--smoke');
  const distDir = path.resolve(__dirname, '..', '..', 'dist');
  const files = loadFiles(distDir);
  const server = http.createServer(createHandler(files));
  server.listen(0, '127.0.0.1', async () => {
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    if (smokeMode) {
      try {
        const n = await smoke(origin, files);
        console.log(`smoke ok: served ${n} files from ${origin}${BASE}`);
        process.exitCode = 0;
      } catch (e) {
        console.error('smoke failed:', e.message);
        process.exitCode = 1;
      }
      server.close();
      return;
    }
    const url = origin + BASE;
    console.log('ATS Simulator is running at ' + url);
    console.log('Your resume never leaves this computer. Close this window to stop.');
    if (!process.argv.includes('--no-open')) openBrowser(url);
  });
}

module.exports = { createHandler, loadFiles, BASE };

if (seaModule() || require.main === module) main();
