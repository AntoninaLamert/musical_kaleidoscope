import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json', '.mp3':'audio/mpeg' };
const server = http.createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(resolve(root) + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Музыкальный калейдоскоп: http://127.0.0.1:${port}\nОставьте окно открытым. Для остановки нажмите Ctrl+C.`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Закройте предыдущий сервер или задайте PORT.` : error.message); process.exitCode = 1; });
