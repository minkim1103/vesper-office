// 캘린더 핵심 로직 — 웹앱 API 와 Claude(MCP) 가 함께 사용합니다.
import { config } from './config.js';
import * as icloud from './caldav.js';
import * as google from './google.js';
import { tasksForBriefing, topicsForBriefing } from './tasks.js';
import { demoStore } from './demo.js';
import {
  expandResource, buildNewEvent, updateEventICS, excludeOccurrenceICS, describeRule,
  DEADLINE_PREFIX, IMPORTANT_RE, buildRRule, parseRRule,
} from './ical.js';
import {
  localToUtc, utcToLocal, dateToDay, dayToDate, todayStr, addDays, koDate, utcToParts,
} from './time.js';

const store = config.demo ? demoStore : icloud;

const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(String(s), 'base64url').toString();
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

/* ───────────── 캐시 ───────────── */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}
const invalidate = () => { for (const k of [...cache.keys()]) if (!k.startsWith('cals')) cache.delete(k); };

/* ───────────── 카테고리(= iCloud 캘린더 + Google 캘린더) ───────────── */

export const calendarStore = () => store;
export const clearCalendarCache = () => cache.delete('cals');

export async function listCategories({ includeHidden = false, includeVesper = false } = {}) {
  const [icl, ggl] = await Promise.all([
    cached('cals', 60_000, () => store.listCalendars()),
    google.enabled()
      ? cached('cals:g', 60_000, () => google.listCalendars()).catch((e) => { console.error(e); return []; })
      : [],
  ]);
  const all = [
    ...icl.map((c) => ({ id: b64(c.url), name: c.name, color: c.color, readOnly: !!c.readOnly, url: c.url, provider: 'icloud', vesper: c.name === config.vesperCalendar })),
    ...ggl.map((c) => ({
      id: b64('g:' + c.gid), name: c.name, color: c.color, readOnly: c.readOnly,
      gid: c.gid, provider: 'google', defaultReminders: c.defaultReminders,
    })),
  ];
  return all
    .filter((c) => includeVesper || !c.vesper)
    .filter((c) => includeHidden || !config.hiddenCalendars.includes(c.name));
}

/** API 응답용: 내부 필드 제거 */
export const publicCategory = ({ url, gid, defaultReminders, vesper, ...c }) => c;

async function resolveCategory(ref, { required = true } = {}) {
  const cats = await listCategories();
  if (!ref) {
    if (!required) return null;
    const first = cats.find((c) => !c.readOnly);
    if (!first) throw fail('쓰기 가능한 캘린더가 없습니다.');
    return first;
  }
  const r = String(ref).trim();
  const found = cats.find((c) => c.id === r)
    || cats.find((c) => c.name === r)
    || cats.find((c) => c.name.toLowerCase().includes(r.toLowerCase()));
  if (!found) throw fail(`'${r}' 카테고리를 찾을 수 없습니다. 가능한 카테고리: ${cats.map((c) => c.name).join(', ')}`);
  return found;
}

export async function createCategory(name, color = '#5B6CF0') {
  if (!name?.trim()) throw fail('카테고리 이름을 입력하세요.');
  await store.createCalendar(name.trim(), color);
  cache.delete('cals');
  return (await listCategories()).find((c) => c.name === name.trim());
}

/* ───────────── 일정 조회 ───────────── */

function toEvent(occ, cat, href) {
  const i = occ.info;
  let startDate, startTime = null, endDate, endTime = null;
  if (occ.allDay) {
    startDate = dayToDate(occ.startDay);
    endDate = dayToDate(occ.endDay);
  } else {
    const s = utcToLocal(occ.startMs), e = utcToLocal(occ.endMs);
    startDate = s.date; startTime = s.time; endDate = e.date; endTime = e.time;
  }
  return {
    id: b64(href),
    occurrence: occ.occurrence,
    calendarId: cat.id, calendar: cat.name, color: cat.color, readOnly: cat.readOnly,
    title: i.title, deadline: i.deadline, allDay: occ.allDay,
    startDate, startTime, endDate, endTime, startMs: occ.startMs, endMs: occ.endMs,
    location: i.location, notes: i.notes, url: i.url, alerts: i.alerts,
    recurring: !!(i.rrule && i.rrule.freq), recurrence: describeRule(i.rrule),
  };
}

/** Google 일정 → 앱 일정 형식 */
function gToEvent(ev, cat) {
  const raw = ev.summary || '';
  const deadline = IMPORTANT_RE.test(raw);
  const title = raw.replace(IMPORTANT_RE, '').trim() || '(제목 없음)';
  const allDay = !!ev.start?.date;
  let startDate, startTime = null, endDate, endTime = null, startMs, endMs;
  if (allDay) {
    startDate = ev.start.date;
    endDate = addDays(ev.end?.date || addDays(startDate, 1), -1);
    if (endDate < startDate) endDate = startDate;
    startMs = localToUtc(startDate); endMs = localToUtc(addDays(endDate, 1));
  } else {
    startMs = Date.parse(ev.start.dateTime);
    endMs = Date.parse(ev.end?.dateTime || ev.start.dateTime);
    const s = utcToLocal(startMs), e = utcToLocal(endMs);
    startDate = s.date; startTime = s.time; endDate = e.date; endTime = e.time;
  }
  const rr = (ev.recurrence || []).find((r) => r.startsWith('RRULE:'));
  const alerts = ev.reminders?.useDefault
    ? (cat.defaultReminders || [])
    : (ev.reminders?.overrides || []).filter((o) => o.method === 'popup').map((o) => o.minutes);
  return {
    id: b64(`g:${cat.gid}\n${ev.recurringEventId || ev.id}`),
    occurrence: ev.recurringEventId ? ev.id : null,
    calendarId: cat.id, calendar: cat.name, color: cat.color, readOnly: cat.readOnly,
    title, deadline, allDay, startDate, startTime, endDate, endTime, startMs, endMs,
    location: ev.location || '', notes: ev.description || '', url: ev.htmlLink || '',
    alerts: [...new Set(alerts)].sort((a, b) => a - b),
    recurring: !!(ev.recurringEventId || rr), recurrence: rr ? describeRule(parseRRule(rr.slice(6))) : null,
  };
}

/** 정리된 입력 → Google 요청 본문 (patch: 기존 일정 수정) */
function gBody(input, existing) {
  const b = {};
  if (input.title !== undefined || input.deadline !== undefined) {
    const title = input.title ?? existing?.title ?? '';
    const dl = input.deadline ?? existing?.deadline ?? false;
    b.summary = (dl ? DEADLINE_PREFIX : '') + title;
  }
  if (input.allDay !== undefined) {
    const clear = existing ? { dateTime: null, date: null, timeZone: null } : {};
    if (input.allDay) {
      b.start = { ...clear, date: dayToDate(input.startDay) };
      b.end = { ...clear, date: dayToDate(input.endDayExclusive) };
    } else {
      b.start = { ...clear, dateTime: new Date(input.startMs).toISOString(), timeZone: config.tz };
      b.end = { ...clear, dateTime: new Date(input.endMs).toISOString(), timeZone: config.tz };
    }
  }
  if (input.location !== undefined) b.location = input.location;
  if (input.notes !== undefined) b.description = input.notes;
  if (input.recurrence !== undefined) {
    b.recurrence = input.recurrence ? ['RRULE:' + buildRRule(input.recurrence, input.allDay ?? existing?.allDay)] : [];
  }
  if (input.alerts !== undefined) {
    // Google 은 '시작 후' 알림(음수)을 지원하지 않음 → 제외
    const mins = [...new Set(input.alerts.filter((m) => m >= 0 && m <= 40320))].slice(0, 5);
    b.reminders = { useDefault: false, overrides: mins.map((m) => ({ method: 'popup', minutes: m })) };
  }
  return b;
}

/** from, to: 'YYYY-MM-DD' (to 포함) */
export async function listEvents({ from, to, categories, query } = {}) {
  from = from || todayStr();
  to = to || addDays(from, 30);
  if (dateToDay(to) - dateToDay(from) > 400) throw fail('한 번에 400일 이내로 조회하세요.');
  const startMs = localToUtc(from), endMs = localToUtc(addDays(to, 1));
  let cats = await listCategories();
  if (categories?.length) {
    const want = await Promise.all(categories.map((c) => resolveCategory(c)));
    cats = cats.filter((c) => want.some((w) => w.id === c.id));
  }
  const lists = await Promise.all(cats.map(async (cat) => {
    if (cat.provider === 'google') {
      const items = await cached(`g:${cat.gid}:${startMs}:${endMs}`, 20_000, () => google.listInstances(cat.gid, startMs, endMs));
      return items.map((ev) => gToEvent(ev, cat));
    }
    const objs = await cached(`obj:${cat.url}:${startMs}:${endMs}`, 20_000, () => store.queryObjects(cat.url, startMs, endMs));
    return objs.flatMap((o) => {
      try { return expandResource(o.data, startMs, endMs).map((occ) => toEvent(occ, cat, o.href)); } catch { return []; }
    });
  }));
  let events = lists.flat();
  if (query) {
    const q = query.toLowerCase();
    events = events.filter((e) => [e.title, e.location, e.notes].some((t) => t?.toLowerCase().includes(q)));
  }
  return events.sort((a, b) => (a.startMs - b.startMs) || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
}

/* ───────────── 입력 정리 ───────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
const normTime = (t) => { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}`; };

export const DEFAULT_DEADLINE_ALERTS = { allDay: [3780, 900, -540], timed: [4320, 1440, 60] };

/**
 * 사용자 입력 → ical.js 입력
 * existing: 수정 시 기존 일정(toEvent 형식, 반복 일정이면 첫 회차가 아닌 마스터 기준이 필요하므로 master 정보 사용)
 */
function normalizeInput(raw, existing) {
  const out = {};
  if (raw.title !== undefined) {
    if (!String(raw.title).trim()) throw fail('제목을 입력하세요.');
    out.title = String(raw.title).trim();
  }
  if (raw.deadline !== undefined) out.deadline = !!raw.deadline;
  if (raw.location !== undefined) out.location = raw.location || '';
  if (raw.notes !== undefined) out.notes = raw.notes || '';
  if (raw.alerts !== undefined) {
    if (!Array.isArray(raw.alerts)) throw fail('alerts 는 숫자 배열이어야 합니다.');
    out.alerts = raw.alerts.map(Number).filter((n) => Number.isFinite(n));
  }
  if (raw.recurrence !== undefined) {
    const r = raw.recurrence;
    if (!r || !r.freq || r.freq === 'NONE') out.recurrence = null;
    else {
      const freq = String(r.freq).toUpperCase();
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) throw fail('반복은 DAILY/WEEKLY/MONTHLY/YEARLY 중 하나입니다.');
      out.recurrence = {
        freq, interval: r.interval ? +r.interval : 1, count: r.count ? +r.count : null,
        until: r.until && DATE_RE.test(r.until) ? r.until : null,
        byday: Array.isArray(r.byday) && r.byday.length ? r.byday.map((d) => String(d).toUpperCase()) : null,
      };
    }
  }

  const timingKeys = ['allDay', 'startDate', 'startTime', 'endDate', 'endTime'];
  if (timingKeys.some((k) => raw[k] !== undefined) || !existing) {
    const allDay = raw.allDay !== undefined ? !!raw.allDay
      : existing ? existing.allDay : !raw.startTime;
    const startDate = raw.startDate ?? existing?.startDate;
    if (!startDate || !DATE_RE.test(startDate)) throw fail('startDate 는 YYYY-MM-DD 형식이어야 합니다.');
    out.allDay = allDay;
    if (allDay) {
      let endDate = raw.endDate ?? (raw.startDate && existing ? addDays(raw.startDate, dateToDay(existing.endDate) - dateToDay(existing.startDate)) : existing?.endDate) ?? startDate;
      if (!DATE_RE.test(endDate) || endDate < startDate) endDate = startDate;
      out.startDay = dateToDay(startDate);
      out.endDayExclusive = dateToDay(endDate) + 1;
    } else {
      let startTime = raw.startTime ?? existing?.startTime ?? '09:00';
      if (!TIME_RE.test(startTime)) throw fail('startTime 은 HH:mm 형식이어야 합니다.');
      startTime = normTime(startTime);
      out.startMs = localToUtc(startDate, startTime);
      const prevDur = existing && !existing.allDay ? existing.endMs - existing.startMs : 3600_000;
      if (raw.endTime) {
        if (!TIME_RE.test(raw.endTime)) throw fail('endTime 은 HH:mm 형식이어야 합니다.');
        const endDate = raw.endDate && DATE_RE.test(raw.endDate) ? raw.endDate : startDate;
        out.endMs = localToUtc(endDate, normTime(raw.endTime));
        if (out.endMs <= out.startMs && !raw.endDate) out.endMs += 86400_000; // 자정 넘김
      } else out.endMs = out.startMs + prevDur;
      if (out.endMs < out.startMs) throw fail('종료 시간이 시작 시간보다 빠릅니다.');
    }
    if (existing && existing.allDay !== allDay && raw.alerts === undefined) out.alerts = [];
  }
  return out;
}

/* ───────────── 생성 / 수정 / 삭제 ───────────── */

async function eventFromResource(href, data, cat) {
  // 리소스의 첫 회차(또는 단일 일정)를 이벤트 형식으로
  const occ = expandResource(data, -8.64e15, 8.64e15)[0];
  return occ ? toEvent(occ, cat, href) : null;
}

async function masterOf(id) {
  const href = unb64(id);
  const cats = await listCategories({ includeHidden: true });
  if (href.startsWith('g:')) {
    const [gid, eid] = href.slice(2).split('\n');
    const cat = cats.find((c) => c.provider === 'google' && c.gid === gid);
    if (!cat) throw fail('일정이 속한 Google 캘린더를 찾을 수 없습니다.', 404);
    const ev = await google.getEvent(gid, eid);
    return { google: true, eid, cat, event: gToEvent(ev, cat) };
  }
  const cat = cats.find((c) => c.url && href.startsWith(c.url));
  if (!cat) throw fail('일정이 속한 캘린더를 찾을 수 없습니다.', 404);
  const obj = await store.getObject(href);
  return { href, cat, obj, event: await eventFromResource(href, obj.data, cat) };
}

async function createIn(cat, input) {
  if (cat.provider === 'google') {
    const ev = await google.insertEvent(cat.gid, gBody(input, null));
    invalidate();
    return gToEvent(ev, cat);
  }
  const { uid, ics } = buildNewEvent(input);
  const href = `${cat.url}${uid}.ics`;
  await store.putObject(href, ics);
  invalidate();
  return eventFromResource(href, ics, cat);
}

export async function createEvent(raw) {
  const cat = await resolveCategory(raw.calendarId || raw.category);
  if (cat.readOnly) throw fail(`'${cat.name}' 캘린더는 읽기 전용입니다.`);
  const input = normalizeInput(raw, null);
  if (input.alerts === undefined) input.alerts = input.deadline ? DEFAULT_DEADLINE_ALERTS[input.allDay ? 'allDay' : 'timed'] : [];
  return createIn(cat, input);
}

/** iCloud ↔ Google 처럼 서비스가 다른 캘린더로 옮길 때: 새로 만들고 원본 삭제 */
async function crossMove(event, input, target, removeOld) {
  const full = normalizeInput({
    title: event.title, deadline: event.deadline, allDay: event.allDay,
    startDate: event.startDate, startTime: event.startTime || undefined, endDate: event.endDate, endTime: event.endTime || undefined,
    location: event.location, notes: event.notes, alerts: event.alerts,
    recurrence: event.recurrence ? { ...event.recurrence } : undefined,
  }, null);
  Object.assign(full, input);
  const created = await createIn(target, full);
  await removeOld();
  invalidate();
  return created;
}

export async function updateEvent(id, raw) {
  const m = await masterOf(id);
  const { href, cat, obj, event } = m;
  if (cat.readOnly) throw fail(`'${cat.name}' 캘린더는 읽기 전용입니다.`);
  const input = normalizeInput(raw, event);
  if (input.deadline && !event.deadline && input.alerts === undefined && !(event.alerts || []).length) {
    input.alerts = DEFAULT_DEADLINE_ALERTS[(input.allDay ?? event.allDay) ? 'allDay' : 'timed'];
  }
  const target = raw.calendarId || raw.category ? await resolveCategory(raw.calendarId || raw.category) : cat;
  if (target.id !== cat.id && target.readOnly) throw fail(`'${target.name}' 캘린더는 읽기 전용입니다.`);

  if (m.google) {
    if (target.provider !== 'google') return crossMove(event, input, target, () => google.deleteEvent(cat.gid, m.eid));
    let gid = cat.gid;
    if (target.id !== cat.id) { await google.moveEvent(cat.gid, m.eid, target.gid); gid = target.gid; }
    const body = gBody(input, event);
    const ev = Object.keys(body).length ? await google.patchEvent(gid, m.eid, body) : await google.getEvent(gid, m.eid);
    invalidate();
    return gToEvent(ev, target);
  }
  if (target.provider === 'google') return crossMove(event, input, target, () => store.deleteObject(href, obj.etag));

  const newData = updateEventICS(obj.data, input);
  if (target.id !== cat.id) {
    const newHref = `${target.url}${href.split('/').pop()}`;
    await store.putObject(newHref, newData);
    await store.deleteObject(href, obj.etag);
    invalidate();
    return eventFromResource(newHref, newData, target);
  }
  await store.putObject(href, newData, obj.etag);
  invalidate();
  return eventFromResource(href, newData, cat);
}

export async function deleteEvent(id, { occurrence } = {}) {
  const m = await masterOf(id);
  const { href, cat, obj, event } = m;
  if (cat.readOnly) throw fail(`'${cat.name}' 캘린더는 읽기 전용입니다.`);
  if (m.google) {
    await google.deleteEvent(cat.gid, occurrence && event?.recurring ? occurrence : m.eid);
    invalidate();
    return { ok: true, title: event?.title };
  }
  if (occurrence && event?.recurring) {
    await store.putObject(href, excludeOccurrenceICS(obj.data, occurrence), obj.etag);
  } else {
    await store.deleteObject(href, obj.etag);
  }
  invalidate();
  return { ok: true, title: event?.title };
}

export async function getEvent(id) {
  return (await masterOf(id)).event;
}

/* ───────────── 브리핑 ───────────── */

const fmtTime = (e) => (e.allDay ? '하루 종일' : `${e.startTime}–${e.endTime}`);
export function dday(dateStr, today = todayStr()) {
  const n = dateToDay(dateStr) - dateToDay(today);
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
}

export async function briefing({ date, days = 14 } = {}) {
  const today = date || todayStr();
  const events = await listEvents({ from: addDays(today, -1), to: addDays(today, Math.max(days, 1)) });
  const onDay = (d) => events.filter((e) => e.startDate <= d && e.endDate >= d);
  const todays = onDay(today);
  const tomorrow = onDay(addDays(today, 1));
  const deadlines = events.filter((e) => e.deadline && e.startDate >= today);
  const seen = new Set();
  const uniqDeadlines = deadlines.filter((e) => !seen.has(e.id + e.startDate) && seen.add(e.id + e.startDate));

  const timed = todays.filter((e) => !e.allDay).sort((a, b) => a.startMs - b.startMs);
  const conflicts = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].startMs < timed[i].endMs) conflicts.push([timed[i].title, timed[j].title]);
    }
  }
  const tk = await tasksForBriefing(today, 7).catch(() => ({ overdue: [], upcoming: [], alarmsToday: [] }));
  const research = await topicsForBriefing(today).catch(() => []);
  const tline = (t) => `- ${t.due ? `${dday(t.due.date, today)} ` : ''}${t.title} (${t.area}${t.tag ? '·' + t.tag : ''})${t.due ? ` · ${koDate(t.due.date)}${t.due.time ? ' ' + t.due.time : ''}` : ''}`;
  const now = utcToParts(Date.now());
  const line = (e) => `- ${fmtTime(e)} ${e.deadline ? '[중요] ' : ''}${e.title}${e.location ? ` @${e.location}` : ''} (${e.calendar})`;
  const text = [
    `📅 ${koDate(today)} 브리핑`,
    '',
    `오늘 일정 ${todays.length}건`,
    ...(todays.length ? todays.map(line) : ['- 일정 없음']),
    ...(conflicts.length ? ['', '⚠️ 시간이 겹치는 일정', ...conflicts.map(([a, b]) => `- ${a} ↔ ${b}`)] : []),
    '',
    `⭐ 중요 일정 (${days}일 이내)`,
    ...(uniqDeadlines.length ? uniqDeadlines.map((e) => `- ${dday(e.startDate, today)} ${e.title} · ${koDate(e.startDate)}${e.startTime ? ` ${e.startTime}` : ''}`) : ['- 없음']),
    '',
    `내일 일정 ${tomorrow.length}건`,
    ...(tomorrow.length ? tomorrow.map(line) : ['- 일정 없음']),
    ...(tk.overdue.length || tk.upcoming.length ? ['', '📝 할 일 (Spaces)'] : []),
    ...tk.overdue.map((t) => tline(t) + ' ⚠️ 지남'),
    ...tk.upcoming.map(tline),
  ].join('\n');
  return {
    date: today, generatedAt: `${now.y}-${String(now.m).padStart(2, '0')}-${String(now.d).padStart(2, '0')} ${String(now.hh).padStart(2, '0')}:${String(now.mm).padStart(2, '0')}`,
    today: todays, tomorrow, deadlines: uniqDeadlines.map((e) => ({ ...e, dday: dday(e.startDate, today) })),
    conflicts, text, tasks: tk, research,
  };
}

export const mode = () => (config.demo ? 'demo' : 'icloud');
export const googleStatus = () => google.status();
