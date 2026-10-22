import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { proxy } from './server/proxy.js';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const root = path.resolve('dist'), port = Number(process.env.PORT || 8357);
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return proxy(request, response, url.pathname.slice(5));
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
    const info = await stat(file); if (!info.isFile()) throw new Error('not_file');
    response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
