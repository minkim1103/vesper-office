// Spaces 테스트: iCloud 'Vesper' 캘린더에 할 일 저장 (데모 저장소로 검증)
import assert from 'node:assert/strict';
import * as svc from '../src/service.js';
import * as tasks from '../src/tasks.js';
import { handleMcp } from '../src/mcp.js';
import { parseICS, readVevent } from '../src/ical.js';
import { todayStr, addDays, localToUtc } from '../src/time.js';

let n = 0; const ok = (s) => console.log(`✓ V${++n}. ${s}`);
const t0 = todayStr();
const call = async (name, args = {}) => {
  const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  if (r.body.result.isError) throw new Error(r.body.result.content[0].text);
  return JSON.parse(r.body.result.content[0].text);
};

const areas = await call('list_areas');
assert.deepEqual(areas.map((a) => a.name), ['업무', '개인', '집']);
assert.deepEqual(areas[0].subs, ['회의', '문서', '보고', '프로젝트']);
const cats = await svc.listCategories({ includeVesper: true });
assert.ok(cats.some((c) => c.vesper && c.name === 'Vesper'));
assert.ok(!(await svc.listCategories()).some((c) => c.vesper));
ok('Vesper 캘린더 자동 생성, 기본 카테고리, 일반 캘린더 목록에서는 숨김');

const poster = (await call('add_task', { title: '포스터 제출', area: '업무', tag: '프로젝트', dueDate: addDays(t0, 20), alarms: [`${addDays(t0, 15)} 09:00`], notes: 'A0 사이즈' })).added;
const mail = (await call('add_task', { title: '교수님께 메일', area: '업무', tag: '문서', dueDate: addDays(t0, 2), dueTime: '22:00', alarms: [`${addDays(t0, 2)} 21:00`] })).added;
const trip = (await call('add_task', { title: '나들이 장소 예약', area: '개인', dueDate: addDays(t0, 5) })).added;
const idea = (await call('add_task', { title: '방 정리', area: '집' })).added;
assert.deepEqual(trip.alarms, [`${addDays(t0, 4)} 09:00`, `${addDays(t0, 5)} 09:00`]);
assert.equal(idea.due, undefined);
ok('Claude 로 할 일 저장 (마감·알람·메모·하위 카테고리, 기본 알람, 날짜 없는 할 일)');

// 실제로 저장된 iCloud 데이터 확인
const store = svc.calendarStore();
const vcal = (await svc.listCategories({ includeVesper: true })).find((c) => c.vesper);
const objs = await store.queryObjects(vcal.url);
const mailObj = objs.find((o) => o.data.includes('교수님께 메일'));
const v = parseICS(mailObj.data).children.find((c) => c.name === 'VEVENT');
const info = readVevent(v);
assert.equal(info.start.ms, localToUtc(addDays(t0, 2), '22:00'));
assert.deepEqual(info.alerts, [60]); // 마감 1시간 전 = 21:00
const posterObj = objs.find((o) => o.data.includes('포스터 제출'));
assert.deepEqual(readVevent(parseICS(posterObj.data).children[0]).alerts, [5 * 1440 - 540]); // 하루종일: 5일 전 09:00
ok('아이폰 알림(VALARM)이 정확한 시각으로 저장됨');

// iCloud 가 X- 속성을 지워도 복구되는지
const stripped = mailObj.data.split('\r\n').filter((l) => !l.startsWith('X-VESPER')).join('\r\n');
await store.putObject(mailObj.href, stripped);
let list = await tasks.listTasks();
await new Promise((r) => setTimeout(r, 16_000)); // 캐시 만료
list = await tasks.listTasks();
const m2 = list.find((t) => t.title === '교수님께 메일');
assert.equal(m2.area, '업무'); assert.equal(m2.tag, '문서'); assert.deepEqual(m2.alarms, [`${addDays(t0, 2)}T21:00`]);
ok('iCloud 가 추가 정보를 지워도 카테고리·알람 복구');

const done = (await call('update_task', { id: trip.id, done: true })).updated;
assert.equal(done.done, true);
const tripObj = (await store.queryObjects(vcal.url)).find((o) => o.data.includes('나들이'));
assert.ok(!tripObj.data.includes('BEGIN:VALARM') && tripObj.data.includes('SUMMARY:✓ 나들이'));
const reopened = (await call('update_task', { id: trip.id, done: false })).updated;
assert.deepEqual(reopened.alarms, [`${addDays(t0, 4)} 09:00`, `${addDays(t0, 5)} 09:00`]);
ok('완료하면 아이폰 알림 해제·✓ 표시, 되돌리면 알림 복원');

const exp = (await call('add_task', { title: 'PFM 측정', area: '업무', tag: '분석', dueDate: addDays(t0, 10) })).added;
assert.ok((await call('list_areas'))[0].subs.includes('분석'));
await call('edit_categories', { op: 'add_area', name: '동아리', subs: ['공연'] });
await call('edit_categories', { op: 'rename_sub', area: '업무', sub: '프로젝트', name: '논문' });
const renamed = (await call('list_tasks', { area: '업무' })).find((t) => t.id === poster.id);
assert.equal(renamed.tag, '논문');
await assert.rejects(call('edit_categories', { op: 'remove_area', area: '업무' }), /진행 중인 할 일/);
assert.ok((await call('list_areas')).some((a) => a.name === '동아리'));
ok('카테고리 자유 편집: 새 하위 자동 추가, 상위 추가, 이름 변경 시 할 일도 변경, 사용 중 삭제 방지');

const evs = await svc.listEvents({ from: t0, to: addDays(t0, 30) });
assert.ok(!evs.some((e) => e.title.includes('포스터')));
const b = await svc.briefing();
assert.match(b.text, /📝 할 일/); assert.match(b.text, /교수님께 메일/);
ok('일반 일정 목록과는 분리, 아침 브리핑에는 포함');

await call('delete_task', { id: idea.id });
assert.ok(!(await call('list_tasks')).some((t) => t.id === idea.id));
await call('update_task', { id: exp.id, dueDate: addDays(t0, 12), alarms: [] });
assert.ok(!(await store.queryObjects(vcal.url)).find((o) => o.data.includes('PFM')).data.includes('VALARM'));
ok('삭제, 알람 비우기');

// The web form sends null for optional fields; clearing dates must survive readback.
const noDeadline = await tasks.addTask({ title: '마감 없는 할 일', dueDate: null, dueTime: null, startDate: null, alarms: [] });
assert.equal(noDeadline.due, null);
let dated = await tasks.addTask({ title: '마감 지우기', dueDate: addDays(t0, 9), dueTime: '14:00', startDate: t0, alarms: [] });
await tasks.updateTask(dated.id, { dueTime: null });
assert.equal((await tasks.listTasks()).find(t => t.id === dated.id).due.time, null);
await tasks.updateTask(dated.id, { dueDate: null, dueTime: null, startDate: null });
const cleared = (await tasks.listTasks()).find(t => t.id === dated.id);
assert.equal(cleared.due, null);
assert.equal(cleared.start, null);
ok('웹 폼의 마감 없는 저장, 마감 시각·날짜·시작일 지우기 후 재조회');
