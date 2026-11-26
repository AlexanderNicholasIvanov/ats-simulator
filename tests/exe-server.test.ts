import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Handler = Parameters<typeof createServer>[1];
const require = createRequire(import.meta.url);
const { createHandler } = require('../scripts/exe/server.cjs') as {
  createHandler: (files: Map<string, Buffer>) => NonNullable<Handler>;
};

const files = new Map<string, Buffer>([
  ['/index.html', Buffer.from('<script src="/ats-simulator/assets/app.js"></script>')],
  ['/assets/app.js', Buffer.from('console.log(1)')],
  ['/assets/pdf.worker.min-x.mjs', Buffer.from('self.x=1')],
]);
let server: Server;
let origin = '';

beforeAll(async () => {
  server = createServer(createHandler(files));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('exe launcher server', () => {
  it('redirects / to the app base path', async () => {
    const r = await fetch(origin + '/', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/ats-simulator/');
  });

  it('serves index.html and assets with the right types', async () => {
    const page = await fetch(origin + '/ats-simulator/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/^text\/html/);
    const worker = await fetch(origin + '/ats-simulator/assets/pdf.worker.min-x.mjs');
    expect(worker.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(await worker.text()).toBe('self.x=1');
  });

  it('404s for unknown paths and traversal attempts, 405 for writes', async () => {
    expect((await fetch(origin + '/ats-simulator/nope.js')).status).toBe(404);
    expect((await fetch(origin + '/ats-simulator/..%2f..%2fpackage.json')).status).toBe(404);
    expect((await fetch(origin + '/etc/passwd')).status).toBe(404);
    expect((await fetch(origin + '/ats-simulator/', { method: 'POST' })).status).toBe(405);
  });
});
