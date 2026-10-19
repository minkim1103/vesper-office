// 로컬 실행: `npm start` → http://localhost:3000
// (Vercel 이 아닌 곳 — 집 PC, Render 등 — 에서 돌릴 때도 이 파일을 사용합니다)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './src/handler.js';
import { config } from './src/config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p.startsWith('/api/') || p.startsWith('/mcp')) return handler(req, res);
  const file = path.join(root, p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(process.env.PORT || 3000, () => {
  console.log(`캘린더 서버 실행 중: http://localhost:${process.env.PORT || 3000}  (${config.demo ? '데모 모드 — 비밀번호 demo' : 'iCloud 연동'})`);
});
