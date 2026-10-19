import assert from 'node:assert/strict';
import * as svc from '../src/service.js';
import * as tasks from '../src/tasks.js';
import { handleMcp } from '../src/mcp.js';
import { addDays } from '../src/time.js';

const call = async (name, args = {}) => {
  const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert.ok(!r.body.result.isError, r.body.result.content[0].text);
  return JSON.parse(r.body.result.content[0].text);
};
const baseline = await call('get_briefing_style');
assert.equal(baseline.personalInstructions, '');
assert.match(baseline.defaultInstructions, /30초/);
const personal = '존댓말, 오늘 전체 일정은 유지하고 제안은 1개만. 표 대신 짧은 문장.';
await call('save_briefing_style', { markdown: personal });
await call('save_secretary_notes', { markdown: '- 주말 업무 준비 제안은 선호하지 않음' });
const dated = await call('get_today');
await call('create_event', { title: '준비가 필요한 발표', startDate: dated.today, startTime: '14:00', endTime: '15:00' });
await call('add_task', { title: '다음 주 후반 마감 준비', dueDate: addDays(dated.today, 12) });
const first = await call('get_briefing');
assert.equal(first.briefingStyle.personalInstructions, personal);
assert.equal(first.briefingStyle.defaultInstructions, baseline.defaultInstructions);
assert.match(first.briefingStyle.feedbackNotes, /주말 업무/);
assert.ok(first.horizon.some(e => e.title === '준비가 필요한 발표'));
assert.ok(first.planningTasks.some(t => t.title === '다음 주 후반 마감 준비'));
const before = await tasks.listTasks();
const ctx = await svc.briefing();
assert.equal(ctx.briefingStyle.personalInstructions, personal); // Also used by the Actions HTTP route.
assert.deepEqual(await tasks.listTasks(), before); // Reading guidance does not create user tasks.
await call('save_daily_briefing', { markdown: '# 맞춤 브리핑\n- 14:00 발표' });
assert.equal((await tasks.getNote('daily')).text, '# 맞춤 브리핑\n- 14:00 발표');
await call('save_briefing_style', { markdown: '' });
const reset = await call('get_briefing_style');
assert.equal(reset.personalInstructions, '');
assert.equal(reset.defaultInstructions, baseline.defaultInstructions);
assert.match(reset.feedbackNotes, /주말 업무/);
await assert.rejects(tasks.saveBriefingStyle(null));
await assert.rejects(tasks.saveBriefingStyle('x'.repeat(12001)));
console.log('✓ Briefing style: personal persistence/readback, default preserved, feedback, future context, reset and no task mutation');
