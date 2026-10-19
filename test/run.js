// 간단한 자체 테스트 (데모 모드)
import assert from 'node:assert/strict';
import * as svc from '../src/service.js';
import { handleMcp } from '../src/mcp.js';
import { parseICS, expandResource, updateEventICS, excludeOccurrenceICS, minutesToTrigger } from '../src/ical.js';
import { todayStr, addDays, localToUtc } from '../src/time.js';
import { parseXML } from '../src/caldav.js';

let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
const t = todayStr();

// 1. 아이폰에서 만든 형태의 반복 일정 (TZID + VTIMEZONE + 예외 + 수정 회차)
const iphone = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//iPhone OS 18.0//EN\r\nBEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\nBEGIN:STANDARD\r\nDTSTART:19880508T030000\r\nTZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900\r\nTZNAME:KST\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:ABC-1\r\nDTSTART;TZID=Asia/Seoul:20261005T190000\r\nDTEND;TZID=Asia/Seoul:20261005T200000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEXDATE;TZID=Asia/Seoul:20261012T190000\r\nSUMMARY:요가\\, 저녁\r\nBEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:ABC-1\r\nRECURRENCE-ID;TZID=Asia/Seoul:20261014T190000\r\nDTSTART;TZID=Asia/Seoul:20261014T200000\r\nDTEND;TZID=Asia/Seoul:20261014T210000\r\nSUMMARY:요가 (늦게)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const occ = expandResource(iphone, localToUtc('2026-10-01'), localToUtc('2026-10-20'));
const fmt = occ.map((o) => new Date(o.startMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hourCycle: 'h23' }) + ' ' + o.info.title);
assert.equal(occ.length, 4, fmt.join('\n')); // 5, 7, (12 제외), 14(수정), 19
assert.ok(fmt.some((s) => s.includes('14. 20시') && s.includes('늦게')));
assert.equal(occ[0].info.alerts[0], 30);
assert.equal(occ[0].info.title, '요가, 저녁');
ok('아이폰 반복 일정 전개 (요일/예외/수정 회차/알림)');

// 2. 회차 삭제 + 수정 후 원본 속성 보존
const ex = excludeOccurrenceICS(iphone, new Date(localToUtc('2026-10-19', '19:00')).toISOString());
assert.equal(expandResource(ex, localToUtc('2026-10-01'), localToUtc('2026-10-20')).length, 3);
const up = updateEventICS(iphone, { title: '필라테스' });
assert.ok(up.includes('VTIMEZONE') && up.includes('RRULE:FREQ=WEEKLY') && up.includes('RECURRENCE-ID'));
ok('회차 삭제(EXDATE), 제목 수정 시 기존 데이터 보존');

// 3. 알림 TRIGGER 변환
assert.equal(minutesToTrigger(900), '-PT15H');
assert.equal(minutesToTrigger(-540), 'PT9H');
assert.equal(minutesToTrigger(2340), '-P1DT15H');
assert.equal(minutesToTrigger(10), '-PT10M');
ok('알림 시점 변환');

// 4. 월 반복(마지막 금요일), 연 반복, COUNT
const monthly = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:M\r\nDTSTART;VALUE=DATE:20260130\r\nRRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3\r\nSUMMARY:월말 정산\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const mo = expandResource(monthly, localToUtc('2026-01-01'), localToUtc('2026-12-31')).map((o) => o.startDay);
assert.equal(mo.length, 3);
const yearly = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:Y\r\nDTSTART;VALUE=DATE:20200315\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:생일\r\nEND:VEVENT\r\nEND:VCALENDAR`;
assert.equal(expandResource(yearly, localToUtc('2026-01-01'), localToUtc('2027-12-31')).length, 2);
ok('월간(마지막 금요일)/연간/횟수 제한 반복');

// 5. XML (iCloud 응답 형태)
const xml = `<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/123/calendars/home/</href><propstat><prop><displayname>업무 &amp; 회의</displayname><calendar-color xmlns="http://apple.com/ns/ical/">#1BADF8FF</calendar-color><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
const doc = parseXML(xml);
assert.equal(doc.children[0].children[0].children[1].children[0].children[0].text, '업무 & 회의');
assert.equal(doc.children[0].children[0].children[1].children[0].children[2].children[0].attrs.name, 'VEVENT');
ok('CalDAV XML 파싱');

// 6. 서비스: 생성/조회/수정/카테고리 이동/삭제
const cats = await svc.listCategories();
assert.ok(cats.length >= 2);
const ev = await svc.createEvent({ title: '테스트 회의', category: 'Work', startDate: addDays(t, 1), startTime: '14:00', endTime: '15:30', alerts: [15] });
assert.equal(ev.startTime, '14:00'); assert.equal(ev.endTime, '15:30'); assert.deepEqual(ev.alerts, [15]);
let list = await svc.listEvents({ from: addDays(t, 1), to: addDays(t, 1), query: '테스트' });
assert.equal(list.length, 1);
const ev2 = await svc.updateEvent(ev.id, { startTime: '16:00', category: 'Personal' });
assert.equal(ev2.startTime, '16:00'); assert.equal(ev2.endTime, '17:30'); assert.equal(ev2.calendar, 'Personal');
await svc.deleteEvent(ev2.id);
list = await svc.listEvents({ from: addDays(t, 1), to: addDays(t, 1), query: '테스트' });
assert.equal(list.length, 0);
ok('일정 생성 → 수정(시간·카테고리 이동) → 삭제');

// 7. 하루종일/여러 날/자정 넘김
const trip = await svc.createEvent({ title: '출장', startDate: '2026-11-02', endDate: '2026-11-04', category: 'Work' });
assert.equal(trip.allDay, true); assert.equal(trip.endDate, '2026-11-04');
const night = await svc.createEvent({ title: '야간 작업', startDate: '2026-11-05', startTime: '23:00', endTime: '01:00' });
assert.equal(night.endDate, '2026-11-06');
ok('하루종일·여러 날·자정 넘김 일정');

// 8. MCP
const init = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
assert.equal(init.body.result.protocolVersion, '2025-06-18');
assert.equal((await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
const tl = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
assert.ok(tl.body.result.tools.length >= 8);
const dl = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add_deadline', arguments: { title: '세금 신고', dueDate: addDays(t, 6), category: 'Personal', remindDaysBefore: [7, 2, 0] } } });
const created = JSON.parse(dl.body.result.content[0].text).created;
assert.equal(created.deadline, true); assert.deepEqual(created.alerts, [-540, 2340, 9540]);
const br = await handleMcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_briefing', arguments: {} } });
const brief = JSON.parse(br.body.result.content[0].text);
assert.ok(brief.text.includes('세금 신고') && brief.text.includes('D-6'));
const bad = await handleMcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'create_event', arguments: { title: 'x', startDate: '내일' } } });
assert.equal(bad.body.result.isError, true);
ok('MCP: 초기화, 도구 목록, 마감 등록, 브리핑, 오류 처리');

console.log('\n--- 브리핑 예시 ---\n' + brief.text);

// 9. 중요 표시: 예전 [마감] 도 인식, 새 일정은 [중요] 로 저장
const legacy = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:L\r\nDTSTART;VALUE=DATE:20261101\r\nSUMMARY:[마감] 보고서\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const lo = expandResource(legacy, localToUtc('2026-11-01'), localToUtc('2026-11-02'))[0];
assert.equal(lo.info.deadline, true); assert.equal(lo.info.title, '보고서');
const imp = await svc.createEvent({ title: '발표', startDate: '2026-11-10', deadline: true });
assert.deepEqual(imp.alerts, [-540, 900, 3780]);
const plain = await svc.createEvent({ title: '그냥', startDate: '2026-11-11' });
const promoted = await svc.updateEvent(plain.id, { deadline: true });
assert.equal(promoted.deadline, true); assert.equal(promoted.alerts.length, 3);
ok('중요 표시 ([중요]/[마감] 인식, 기본 알림 자동 추가)');
