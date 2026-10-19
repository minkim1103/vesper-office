// Manual browser fixture only. Never runs against a real iCloud account.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import * as svc from '../src/service.js';
import * as tasks from '../src/tasks.js';
import handler from '../src/handler.js';
import { todayStr, addDays } from '../src/time.js';
if (!config.demo) throw new Error('UI fixture requires demo mode');
const day = todayStr();
await svc.createEvent({ title: '주간회의', category: 'Work', startDate: day, startTime: '10:00', location: '강남', notes: '팀 운영 논의' });
await svc.createEvent({ title: '지난 분기 보고', category: 'Work', startDate: addDays(day, -120), startTime: '14:00', location: '강남', notes: '예산 검토' });
await svc.createEvent({ title: '디자인 검토', category: 'Work', startDate: addDays(day, 2), startTime: '15:00' });
for (const [i, name, tag, count, done] of [[0, '신제품 출시', 'Launch', 7, 3], [1, '분기 보고', 'Report', 5, 2], [2, '고객사 제안', 'Client', 4, 1]]) {
  const topic = await tasks.editTopic('create', { name, tag, status: 'active', target: addDays(day, 7 + i * 3) });
  const titles = i === 0 ? ['홍보자료 초안', '디자인 검토', '캠페인 문구', '게시 일정 확인'] : i === 1 ? ['매출자료 정리', '보고서 제출', '자료 확인'] : ['견적서 확인', '미팅 자료 준비', '고객 연락'];
  for (let j = 0; j < count; j++) {
    const completed = j >= count - done;
    const t = await tasks.addTask({ title: completed ? `완료한 준비 ${j + 1}` : titles[j], topic: topic.id, dueDate: j === 2 ? null : addDays(day, i === 2 && j === 0 ? -1 : j * 2 + i), dueTime: j === 0 && i === 0 ? '17:00' : null });
    if (completed) await tasks.updateTask(t.id, { done: true });
  }
}
await tasks.saveNote('briefing', { text: '# 오늘의 업무\n- 오늘은 홍보자료 초안을 먼저 정리하면 좋아요 (신제품 출시)' });
const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) {
    // Deliberately let an older query finish after a newer one.
    if (url.pathname === '/api/events' && url.searchParams.get('q') === '회의') await new Promise(resolve => setTimeout(resolve, 1500));
    return handler(req, res);
  }
  const file = path.join(root, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  try { const bytes = await fs.readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
}).listen(3217, '127.0.0.1', () => console.log('Seeded UI fixture: http://localhost:3217'));
