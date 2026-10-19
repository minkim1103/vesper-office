// Workstream 테스트: 연구 주제, [태그] 연결, Spaces 와 양방향, 브리핑/연구 노트 저장
import assert from 'node:assert/strict';
import * as svc from '../src/service.js';
import * as tasks from '../src/tasks.js';
import { handleMcp } from '../src/mcp.js';
import { buildNewEvent } from '../src/ical.js';
import { todayStr, addDays, dateToDay } from '../src/time.js';

let n = 0; const ok = (s) => console.log(`✓ W${++n}. ${s}`);
const t0 = todayStr();
const call = async (name, args = {}) => {
  const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  if (r.body.result.isError) throw new Error(r.body.result.content[0].text);
  return JSON.parse(r.body.result.content[0].text);
};

// 1. 주제 만들기
const mos2 = (await call('edit_topic', { op: 'create', name: 'MoS2 Soliton', tag: 'MoS2', status: 'active', target: addDays(t0, 60), brief: 'MoS2 적층 도메인 경계(도메인 경계) 형성 조건 계산', keywords: ['soliton', '도메인 경계'] })).result;
const gst = (await call('edit_topic', { op: 'create', name: 'WTe2 NW', tag: '[WTe2]' })).result;
assert.equal(mos2.tag, 'MoS2'); assert.equal(gst.tag, 'WTe2'); assert.equal(gst.status, 'active');
await assert.rejects(call('edit_topic', { op: 'create', name: 'x', tag: 'mos2' }), /이미 다른 주제/);
ok('주제 만들기 (태그 정리, 중복 태그 방지)');

// 2. Claude 로 주제 할 일 → 학교·연구, 제목 앞 [태그]
const a = (await call('add_task', { title: '포텐셜 맵 계산', topic: 'MoS2', startDate: addDays(t0, 2), dueDate: addDays(t0, 9) })).added;
assert.equal(a.topic, 'MoS2 Soliton [MoS2]'); assert.equal(a.area, '업무'); assert.equal(a.tag, '프로젝트'); assert.equal(a.start, addDays(t0, 2));
const store = svc.calendarStore();
const vcal = (await svc.listCategories({ includeVesper: true })).find((c) => c.vesper);
let raw = (await store.queryObjects(vcal.url)).find((o) => o.data.includes('포텐셜 맵'));
assert.match(raw.data, /SUMMARY:\[MoS2\] 포텐셜 맵 계산/);
ok('주제 할 일 → 학교 › 연구 자동, 아이폰 제목 [MoS2] 표시');

// 3. Spaces 목록과 Workstream 필터가 같은 할 일
const spacesList = await tasks.listTasks({ area: '업무', tag: '프로젝트' });
const wsList = await tasks.listTasks({ topic: 'MoS2' });
assert.ok(spacesList.some((t) => t.id === wsList[0].id));
const done = await tasks.updateTask(wsList[0].id, { done: true });
assert.equal((await tasks.listTasks({ area: '업무' })).find((t) => t.id === done.id).done, true);
await tasks.updateTask(done.id, { done: false });
ok('Spaces ↔ Workstream 같은 데이터 (한쪽에서 완료하면 양쪽 반영)');

// 4. 아이폰에서 [WTe2] 붙여 직접 넣은 일정 → 주제 연결, 모르는 [..] 는 제목 유지
const put = async (title) => { const { uid, ics } = buildNewEvent({ title, allDay: true, startDay: dateToDay(addDays(t0, 3)), endDayExclusive: dateToDay(addDays(t0, 4)), alerts: [] }); await store.putObject(`${vcal.url}${uid}.ics`, ics); };
await put('[WTe2] TEM 이미지 정리');
await put('[학회] 포스터 인쇄');
await new Promise((r) => setTimeout(r, 16_000));
let all = await tasks.listTasks();
const tem = all.find((t) => t.title === 'TEM 이미지 정리');
assert.equal(tem.topicName, 'WTe2 NW');
assert.ok(all.some((t) => t.title === '[학회] 포스터 인쇄' && !t.topicId));
ok('아이폰 제목 [태그] → 주제 자동 연결, 모르는 [ ] 는 그대로');

// 5. 태그 바꾸면 할 일 제목도 바뀜, 주제 지우면 연결 해제
await call('edit_topic', { op: 'update', topic: 'WTe2', tag: 'GST', status: 'planned' });
raw = (await store.queryObjects(vcal.url)).find((o) => o.data.includes('TEM 이미지'));
assert.match(raw.data, /SUMMARY:\[GST\] TEM 이미지 정리/);
const tp = await call('list_topics');
assert.equal(tp.find((x) => x.tag === 'GST').status, 'planned');
await call('edit_topic', { op: 'delete', topic: 'GST' });
raw = (await store.queryObjects(vcal.url)).find((o) => o.data.includes('TEM 이미지'));
assert.match(raw.data, /SUMMARY:TEM 이미지 정리/);
ok('태그 변경 → 할 일 제목 [태그] 갱신, 주제 삭제 → 연결 해제');

// 6. 제목에 [MoS2] 를 써도 주제로 해석, 주제 해제
const b = await tasks.addTask({ title: '[MoS2] 논문 조사', dueDate: addDays(t0, 2) });
assert.equal(b.topicName, 'MoS2 Soliton'); assert.equal(b.title, '논문 조사'); assert.equal(b.area, '업무');
const b2 = await tasks.updateTask(b.id, { topic: 'none' });
assert.equal(b2.topicId, null); assert.equal(b2.title, '논문 조사');
ok('제목에 [태그] 직접 입력 → 주제 연결, 해제');

// 7. 브리핑·연구 노트 저장 (덮어쓰기 = 업데이트)
await call('save_briefing', { markdown: '# 오늘\n- 논문 조사 D-2', url: 'https://claude.ai/chat/abc' });
let note = await tasks.getNote('briefing');
assert.equal(note.url, 'https://claude.ai/chat/abc'); assert.match(note.text, /논문 조사/);
const first = note.updatedAt;
await new Promise((r) => setTimeout(r, 5));
await call('save_briefing', { markdown: '# 오늘 (수정)\n- 포텐셜 맵 먼저' });
note = await tasks.getNote('briefing');
assert.match(note.text, /수정/); assert.ok(note.updatedAt > first);
await call('save_research_note', { topic: 'MoS2', markdown: '## 참고 논문\n1. ...' });
assert.match((await tasks.getNote(mos2.id)).text, /참고 논문/);
assert.ok(!(await tasks.listTasks()).some((t) => /Claude|settings/.test(t.title)));
ok('Claude 브리핑·연구 노트 저장/갱신 (할 일 목록에는 안 섞임)');

// 8. 브리핑 데이터에 연구 주제
const br = await call('get_briefing');
assert.equal(br.research[0].name, 'MoS2 Soliton'); assert.ok(br.research[0].brief.includes('도메인 경계'));
ok('get_briefing 에 연구 주제(요약·열린 할 일) 포함');

// 9. 일정 브리핑(daily)은 연구 브리핑과 따로 저장
await call('save_daily_briefing', { markdown: '📅 오늘\n## 오늘\n- 그룹미팅' });
assert.match((await tasks.getNote('daily')).text, /그룹미팅/);
assert.match((await tasks.getNote('briefing')).text, /수정/);
const got = await call('get_note', { key: 'MoS2' });
assert.match(got.note.text, /참고 논문/);
ok('일정 브리핑(daily) 별도 저장, get_note 로 이전 노트 읽기');

// 10. 비서 학습 메모(prefs)
await call('save_secretary_notes', { markdown: '- 10/19 "학회 포스터 인쇄 미리" 제안 → 좋음' });
assert.match((await call('get_note', { key: 'prefs' })).note.text, /포스터 인쇄/);
ok('비서 학습 메모 저장/읽기');

// 11. 할 일 노트
const tk = (await tasks.listTasks()).find((t) => t.topicId);
assert.ok(tk.uid, 'uid 노출');
const sv = await call('save_task_note', { task: tk.title, markdown: '## 논문\n- A — [링크](https://doi.org/x)' });
assert.equal(sv.key, `task-${tk.uid}`);
assert.match((await tasks.getNote(sv.key)).text, /논문/);
assert.match((await call('get_note', { key: sv.key })).note.text, /논문/);
assert.ok(!(await tasks.listTasks()).some((t) => /AI note/.test(t.title)));
ok('할 일 노트 저장/읽기 (할 일 목록에 안 섞임)');

// 14. 일정 브리핑
const b1 = await tasks.setBrief('evt-123', { title: 'Defect 논문선정 마감', date: '2026-10-23', notes: 'Defect 수업 발표 논문 고르기' });
assert.match(b1.key, /^ev-[0-9a-f]{20}$/);
const lb = await call('list_event_briefs');
assert.equal(lb.briefs[0].title, 'Defect 논문선정 마감'); assert.equal(lb.briefs[0].noteUpdatedAt, null);
await call('save_event_note', { key: b1.key, markdown: '## 후보 논문\n- A' });
assert.match((await tasks.getNote(b1.key)).text, /후보/);
let lb2 = (await call('list_event_briefs')).briefs[0];
assert.equal(lb2.needsBriefing, false);
await tasks.setBrief('evt-123', { title: 'Defect 논문선정 마감', date: '2026-10-23', notes: 'Defect 수업 발표 논문 고르기 — 계산 논문 위주' });
lb2 = (await call('list_event_briefs')).briefs[0];
assert.equal(lb2.needsBriefing, true); assert.equal(lb2.memoChanged, true);
await tasks.setBrief('evt-123', { on: false });
assert.deepEqual(await tasks.listBriefs(), {});
ok('일정 브리핑 등록/노트/해제, 메모 바뀌면 다시 브리핑');

// 15. 연구 할 일 메모가 바뀌면 다시 노트
let ct = (await call('check_task_notes')).tasks.find((t) => t.uid === tk.uid);
assert.equal(ct.hasNote, true); assert.equal(ct.memoChanged, false);
await call('update_task', { id: tk.id, notes: '이번엔 MoS2 쪽도 같이 보기' });
ct = (await call('check_task_notes')).tasks.find((t) => t.uid === tk.uid);
assert.equal(ct.memoChanged, true); assert.match(ct.notes, /MoS2/);
await call('save_task_note', { task: tk.uid, markdown: '## 다시 조사\n- B' });
ct = (await call('check_task_notes')).tasks.find((t) => t.uid === tk.uid);
assert.equal(ct.memoChanged, false);
ok('연구 할 일 메모 변경 감지 (check_task_notes)');
