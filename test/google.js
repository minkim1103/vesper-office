// Google 연동 테스트: 가짜 Google API 서버를 띄워서 실제 요청 흐름을 검증합니다.
import http from 'node:http';
import assert from 'node:assert/strict';

const cals = { 'primary@gmail.com': [], 'team@group.calendar.google.com': [] };
let seq = 0;
const iso = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function instances(ev, tMin, tMax) {
  const rr = (ev.recurrence || [])[0];
  if (!rr) return [ev];
  const out = [];
  const step = /WEEKLY/.test(rr) ? 7 * 864e5 : 864e5;
  const s0 = Date.parse(ev.start.dateTime), dur = Date.parse(ev.end.dateTime) - s0;
  for (let t = s0, i = 0; t < tMax && i < 200; t += step, i++) {
    const id = `${ev.id}_${iso(t)}`;
    if ((ev._ex || []).includes(id) || t + dur <= tMin) continue;
    out.push({ ...ev, id, recurringEventId: ev.id, recurrence: undefined,
      start: { dateTime: new Date(t).toISOString() }, end: { dateTime: new Date(t + dur).toISOString() } });
  }
  return out;
}
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const u = new URL(req.url, 'http://x');
  const json = (st, d) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(d ? JSON.stringify(d) : ''); };
  if (u.pathname === '/token') return json(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT' });
  if (req.headers.authorization !== 'Bearer AT') return json(401, { error: { message: 'no auth' } });
  if (u.pathname === '/users/me/calendarList') return json(200, { items: [
    { id: 'primary@gmail.com', summary: 'Gmail 개인', backgroundColor: '#4285f4', accessRole: 'owner', primary: true, defaultReminders: [{ method: 'popup', minutes: 30 }] },
    { id: 'team@group.calendar.google.com', summary: '팀 일정', backgroundColor: '#0b8043', accessRole: 'writer' },
    { id: 'ko.south_korea#holiday@group.v.calendar.google.com', summary: '대한민국의 휴일', backgroundColor: '#16a765', accessRole: 'reader' },
  ] });
  const m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?(\/move)?$/.exec(u.pathname);
  if (!m) return json(404, { error: { message: 'nf' } });
  const cal = decodeURIComponent(m[1]); const eid = m[2] && decodeURIComponent(m[2]);
  const list = cals[cal] || (cals[cal] = []);
  if (!eid && req.method === 'GET') {
    const tMin = Date.parse(u.searchParams.get('timeMin')), tMax = Date.parse(u.searchParams.get('timeMax'));
    const items = list.flatMap((e) => instances(e, tMin, tMax)).filter((e) => {
      const s = e.start.date ? Date.parse(e.start.date + 'T00:00:00+09:00') : Date.parse(e.start.dateTime);
      const en = e.end.date ? Date.parse(e.end.date + 'T00:00:00+09:00') : Date.parse(e.end.dateTime);
      return s < tMax && en > tMin;
    });
    return json(200, { items });
  }
  if (!eid && req.method === 'POST') { const ev = { ...JSON.parse(body), id: `ev${++seq}`, status: 'confirmed' }; list.push(ev); return json(200, ev); }
  const masterId = eid.split('_')[0];
  const ev = list.find((e) => e.id === masterId);
  if (!ev) return json(404, { error: { message: 'Not Found' } });
  if (m[3]) { cals[cal] = list.filter((e) => e !== ev); cals[u.searchParams.get('destination')].push(ev); return json(200, ev); }
  if (req.method === 'GET') return json(200, ev);
  if (req.method === 'PATCH') {
    const p = JSON.parse(body);
    for (const k of ['start', 'end']) if (p[k]) p[k] = Object.fromEntries(Object.entries(p[k]).filter(([, v]) => v !== null));
    Object.assign(ev, p); return json(200, ev);
  }
  if (req.method === 'DELETE') {
    if (eid !== masterId) (ev._ex = ev._ex || []).push(eid); else cals[cal] = list.filter((e) => e !== ev);
    res.writeHead(204); return res.end();
  }
  json(400, {});
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
Object.assign(process.env, {
  GOOGLE_API_BASE: `http://127.0.0.1:${port}`, GOOGLE_TOKEN_URL: `http://127.0.0.1:${port}/token`,
  GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', GOOGLE_REFRESH_TOKEN: 'RT',
});
const svc = await import('../src/service.js');
const { handleMcp } = await import('../src/mcp.js');
let n = 0; const ok = (s) => console.log(`✓ G${++n}. ${s}`);

const cats = await svc.listCategories();
const g = cats.filter((c) => c.provider === 'google');
assert.equal(g.length, 3); assert.equal(g.find((c) => c.name === '대한민국의 휴일').readOnly, true);
assert.ok(cats.some((c) => c.provider === 'icloud'));
ok('iCloud + Google 캘린더 목록 합치기, 읽기 전용 구분');

const a = await svc.createEvent({ title: '구글 회의', category: 'Gmail 개인', startDate: '2026-11-03', startTime: '10:00', endTime: '11:30' });
assert.equal(a.startTime, '10:00'); assert.equal(a.endTime, '11:30'); assert.equal(a.calendar, 'Gmail 개인');
const imp = await svc.createEvent({ title: '보고서', category: '팀 일정', startDate: '2026-11-05', deadline: true });
assert.equal(imp.deadline, true); assert.equal(imp.allDay, true); assert.deepEqual(imp.alerts, [900, 3780]); // 음수(당일 9시)는 Google 미지원 → 제외
ok('Google 일정 생성 (시간 일정, 중요 하루종일 + 기본 알림)');

let list = await svc.listEvents({ from: '2026-11-01', to: '2026-11-07' });
assert.ok(list.some((e) => e.title === '구글 회의') && list.some((e) => e.title === '보고서' && e.endDate === '2026-11-05'));
const up = await svc.updateEvent(a.id, { startTime: '14:00' });
assert.equal(up.startTime, '14:00'); assert.equal(up.endTime, '15:30');
const toAll = await svc.updateEvent(a.id, { allDay: true });
assert.equal(toAll.allDay, true);
ok('조회, 시간 변경(길이 유지), 하루종일 전환');

const mv = await svc.updateEvent(a.id, { category: '팀 일정' });
assert.equal(mv.calendar, '팀 일정');
const toIcloud = await svc.updateEvent(mv.id, { category: 'Work' });
assert.equal(toIcloud.calendar, 'Work'); assert.equal(toIcloud.title, '구글 회의');
assert.equal((await svc.listEvents({ from: '2026-11-03', to: '2026-11-03', categories: ['팀 일정'] })).filter((e) => e.title === '구글 회의').length, 0);
const back = await svc.updateEvent(toIcloud.id, { category: 'Gmail 개인' });
assert.equal(back.calendar, 'Gmail 개인');
ok('Google 캘린더 간 이동, Google ↔ iCloud 이동');

const wk = await svc.createEvent({ title: '스터디', category: 'Gmail 개인', startDate: '2026-11-02', startTime: '20:00', endTime: '21:00', recurrence: { freq: 'WEEKLY' } });
let occ = (await svc.listEvents({ from: '2026-11-01', to: '2026-11-30' })).filter((e) => e.title === '스터디');
assert.equal(occ.length, 5); assert.ok(occ.every((e) => e.recurring && e.id === wk.id));
await svc.deleteEvent(occ[1].id, { occurrence: occ[1].occurrence });
occ = (await svc.listEvents({ from: '2026-11-01', to: '2026-11-30' })).filter((e) => e.title === '스터디');
assert.equal(occ.length, 4);
const master = await svc.getEvent(wk.id);
assert.equal(master.recurrence.freq, 'WEEKLY');
await svc.deleteEvent(wk.id);
assert.equal((await svc.listEvents({ from: '2026-11-01', to: '2026-11-30' })).filter((e) => e.title === '스터디').length, 0);
ok('Google 반복 일정: 회차 펼침, 한 회차 삭제, 전체 삭제');

await assert.rejects(svc.createEvent({ title: 'x', category: '대한민국의 휴일', startDate: '2026-11-01' }), /읽기 전용/);
const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_deadline', arguments: { title: '등록금', dueDate: '2026-11-10', category: '팀 일정' } } });
assert.equal(JSON.parse(r.body.result.content[0].text).created.category, '팀 일정');
ok('읽기 전용 보호, Claude(MCP)로 Google에 중요 일정 등록');
server.close();
