// Servidor local para desenvolvimento e testes: API em /api e o site compilado (web/dist).
// Uso: DATABASE_URL=postgres://... node dev/server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import postgres from 'postgres';
import { createApi, PG_TYPES } from '../server/api.js';

const DIST = new URL('../web/dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function startServer({ databaseUrl, port = 8787, now } = {}) {
  const sql = postgres(databaseUrl, { types: PG_TYPES, onnotice: () => {}, max: 5 });
  const handle = createApi({ sql, secureCookies: false, now });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress);
      const r = await handle(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      const out = {};
      r.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(r.status, out);
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || !extname(p)) p = '/index.html';
    try {
      const data = await readFile(join(DIST, p));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, sql, port })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startServer({ databaseUrl: process.env.DATABASE_URL, port: Number(process.env.PORT || 8787) });
  console.log(`http://localhost:${port}`);
}
