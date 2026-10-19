import assert from 'node:assert/strict';
import { matchesEventQuery, splitSearchRanges } from '../public/search.js';
import * as svc from '../src/service.js';
import { todayStr, addDays } from '../src/time.js';
assert.ok(matchesEventQuery({ title: '주간회의', location: '강남', notes: '분기보고 준비' }, ' 강남   보고 '));
assert.ok(matchesEventQuery({ title: '캘린더'.normalize('NFD') }, '캘린더'));
assert.ok(matchesEventQuery({ title: 'BUDGET Ｑ４' }, 'budget q4'));
assert.ok(!matchesEventQuery({ title: '주간회의', location: '강남' }, '강남 발표'));
const date = addDays(todayStr(), -120);
await svc.createEvent({ title: '분기 보고', location: '강남', notes: '담당자와 예산검토', startDate: date, startTime: '14:00' });
await assert.rejects(svc.listEvents({ from: addDays(todayStr(), -60), to: addDays(todayStr(), 365), query: '보고' }), /400일/);
const ranges = splitSearchRanges(addDays(todayStr(), -365), addDays(todayStr(), 365));
assert.equal(ranges.length, 2);
for (let i = 0; i < ranges.length; i++) {
  assert.ok((Date.parse(ranges[i].to) - Date.parse(ranges[i].from)) / 86400000 <= 400);
  if (i) assert.equal(ranges[i].from, addDays(ranges[i - 1].to, 1));
}
const found = (await Promise.all(ranges.map(range => svc.listEvents({ ...range, query: '강남 예산' })))).flat();
assert.equal(found.length, 1);
assert.equal(found[0].title, '분기 보고');
assert.equal((await svc.listEvents({ from: date, to: date, query: '없는내용' })).length, 0);
console.log('✓ Search: Korean normalization, multi-word title/location/notes, older events, empty results');
