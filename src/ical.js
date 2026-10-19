// 최소한의 iCalendar(RFC 5545) 파서 / 생성기 / 반복 일정 전개기
import crypto from 'node:crypto';
import { config } from './config.js';
import {
  partsToUtc, utcToParts, isValidTz, pad, dateToDay, dayToDate, dayToYmd, ymdToDay,
} from './time.js';

export const DEADLINE_PREFIX = '[중요] ';
export const IMPORTANT_RE = /^\[(중요|마감)\]\s*/;

/* ───────────── 파싱 / 직렬화 ───────────── */

function splitParams(head) {
  // "DTSTART;TZID=Asia/Seoul;VALUE=DATE-TIME" → name + params (따옴표 고려)
  const parts = [];
  let cur = '', q = false;
  for (const ch of head) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '');
  }
  return { name, params };
}

function parseLine(line) {
  let q = false, idx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ':' && !q) { idx = i; break; }
  }
  if (idx < 0) return null;
  const { name, params } = splitParams(line.slice(0, idx));
  return { name, params, value: line.slice(idx + 1) };
}

export function parseICS(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const root = { name: 'ROOT', props: [], children: [] };
  const stack = [root];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const p = parseLine(raw);
    if (!p) continue;
    const top = stack[stack.length - 1];
    if (p.name === 'BEGIN') {
      const c = { name: p.value.toUpperCase(), props: [], children: [] };
      top.children.push(c); stack.push(c);
    } else if (p.name === 'END') {
      if (stack.length > 1) stack.pop();
    } else top.props.push(p);
  }
  return root.children.find((c) => c.name === 'VCALENDAR') || root.children[0] || { name: 'VCALENDAR', props: [], children: [] };
}

function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > limit) { out.push(chunk); chunk = ''; size = 0; limit = 74; }
    chunk += ch; size += n;
  }
  out.push(chunk);
  return out.join('\r\n ');
}

function serializeProp(p) {
  let head = p.name;
  for (const [k, v] of Object.entries(p.params || {})) head += `;${k}=${/[;:,]/.test(v) ? `"${v}"` : v}`;
  return foldLine(`${head}:${p.value}`);
}
export function serializeComp(c) {
  const out = [`BEGIN:${c.name}`];
  for (const p of c.props) out.push(serializeProp(p));
  for (const ch of c.children) out.push(serializeComp(ch));
  out.push(`END:${c.name}`);
  return out.join('\r\n');
}
export const serializeICS = (cal) => serializeComp(cal) + '\r\n';

export const unescapeText = (v = '') => v.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
export const escapeText = (v = '') => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const getProp = (c, name) => c.props.find((p) => p.name === name);
const getProps = (c, name) => c.props.filter((p) => p.name === name);
function setProp(c, name, value, params = {}) {
  c.props = c.props.filter((p) => p.name !== name);
  if (value !== null && value !== undefined && value !== '') c.props.push({ name, params, value });
}

/* ───────────── 날짜 값 ───────────── */

// 반환: { allDay:true, day } | { allDay:false, ms, tz }
export function parseDateValue(prop) {
  if (!prop) return null;
  const v = prop.value.trim();
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    return { allDay: true, day: ymdToDay(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8)) };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, hh, mi, ss = '0'] = m.slice(1, 7).map(Number);
  if (m[7]) return { allDay: false, ms: Date.UTC(y, mo - 1, d, hh, mi, ss), tz: null };
  let tz = prop.params.TZID ? prop.params.TZID.replace(/^\//, '') : config.tz;
  if (!isValidTz(tz)) tz = config.tz;
  return { allDay: false, ms: partsToUtc(y, mo, d, hh, mi, ss, tz), tz };
}

function multiDateValues(prop) {
  // EXDATE 처럼 쉼표로 여러 값이 들어간 속성
  return prop.value.split(',').map((v) => parseDateValue({ ...prop, value: v }));
}

export function fmtUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
export const fmtDay = (day) => dayToDate(day).replace(/-/g, '');

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((v || '').trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const [w, d, h, mi, s] = m.slice(2).map((x) => +(x || 0));
  return sign * ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

/** 알림 "시작 N분 전" → TRIGGER 값 (음수 = 시작 이후, 예: 하루종일 일정 당일 9시 = -540) */
export function minutesToTrigger(min) {
  const before = min >= 0;
  let a = Math.abs(Math.round(min));
  if (a === 0) return 'PT0S';
  const days = Math.floor(a / 1440); a %= 1440;
  const h = Math.floor(a / 60), m = a % 60;
  let s = (before ? '-' : '') + 'P';
  if (days) s += `${days}D`;
  if (h || m) s += 'T' + (h ? `${h}H` : '') + (m ? `${m}M` : '');
  return s;
}

/* ───────────── 반복 규칙 ───────────── */

const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DOW_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(v) {
  if (!v) return null;
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k && val !== undefined) r[k.toUpperCase()] = val;
  }
  return {
    freq: (r.FREQ || '').toUpperCase(),
    interval: Math.max(1, +(r.INTERVAL || 1)),
    count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL ? parseDateValue({ params: {}, value: r.UNTIL }) : null,
    untilRaw: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((s) => {
      const mm = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim());
      return mm ? { n: mm[1] ? +mm[1] : null, dow: DOW[mm[2]] } : null;
    }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
  };
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function nthDowOfMonth(y, m, dow, n) {
  const dim = daysInMonth(y, m);
  const days = [];
  for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === dow) days.push(d);
  if (n === null) return days;
  const d = n > 0 ? days[n - 1] : days[days.length + n];
  return d ? [d] : [];
}

/**
 * 반복 일정의 각 회차 시작일(day 번호, 벽시계 날짜 기준)을 생성합니다.
 * startDay: 첫 회차 날짜, endLimitDay: 이 날짜 이후는 생성하지 않음
 */
function* recurrenceDays(rule, startDay, endLimitDay, untilDay) {
  const s = dayToYmd(startDay);
  let emitted = 0;
  const MAX = 2000;
  const take = function* (days) {
    for (const day of days.sort((a, b) => a - b)) {
      if (day < startDay) continue;
      if (untilDay !== null && day > untilDay) return 'stop';
      if (rule.count !== null && emitted >= rule.count) return 'stop';
      emitted++;
      yield day;
    }
  };
  for (let i = 0; i < MAX; i++) {
    let days = [];
    let periodStart;
    if (rule.freq === 'DAILY') {
      periodStart = startDay + i * rule.interval;
      days = [periodStart];
    } else if (rule.freq === 'WEEKLY') {
      const weekStart = startDay - ((s.dow + 6) % 7); // 월요일 시작
      periodStart = weekStart + i * 7 * rule.interval;
      const dows = rule.byday ? rule.byday.map((b) => b.dow) : [s.dow];
      days = dows.map((dw) => periodStart + ((dw + 6) % 7));
    } else if (rule.freq === 'MONTHLY') {
      const mIndex = (s.m - 1) + i * rule.interval;
      const y = s.y + Math.floor(mIndex / 12), m = (mIndex % 12) + 1;
      periodStart = ymdToDay(y, m, 1);
      if (rule.byday) days = rule.byday.flatMap((b) => nthDowOfMonth(y, m, b.dow, b.n)).map((d) => ymdToDay(y, m, d));
      else {
        const mds = rule.bymonthday || [s.d];
        days = mds.map((md) => (md < 0 ? daysInMonth(y, m) + md + 1 : md))
          .filter((d) => d >= 1 && d <= daysInMonth(y, m)).map((d) => ymdToDay(y, m, d));
      }
    } else if (rule.freq === 'YEARLY') {
      const y = s.y + i * rule.interval;
      periodStart = ymdToDay(y, 1, 1);
      const months = rule.bymonth || [s.m];
      for (const m of months) {
        if (rule.byday) days.push(...rule.byday.flatMap((b) => nthDowOfMonth(y, m, b.dow, b.n)).map((d) => ymdToDay(y, m, d)));
        else {
          const md = (rule.bymonthday || [s.d])[0];
          if (md <= daysInMonth(y, m)) days.push(ymdToDay(y, m, md));
        }
      }
    } else {
      yield startDay; return;
    }
    if (periodStart > endLimitDay) return;
    const res = yield* take(days);
    if (res === 'stop') return;
  }
}

/* ───────────── 이벤트 해석 / 전개 ───────────── */

function alarmMinutes(vevent) {
  const out = [];
  for (const a of vevent.children.filter((c) => c.name === 'VALARM')) {
    const trig = getProp(a, 'TRIGGER');
    if (!trig || trig.params.VALUE === 'DATE-TIME' || trig.params.RELATED === 'END') continue;
    const ms = parseDuration(trig.value);
    if (ms !== null) out.push(Math.round(-ms / 60000));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function describeRule(rule) {
  if (!rule) return null;
  return {
    freq: rule.freq, interval: rule.interval, count: rule.count,
    until: rule.until ? (rule.until.allDay ? dayToDate(rule.until.day) : new Date(rule.until.ms).toISOString().slice(0, 10)) : null,
    byday: rule.byday ? rule.byday.map((b) => (b.n ? b.n : '') + DOW_NAMES[b.dow]) : null,
  };
}

/** VEVENT → 기본 정보 */
export function readVevent(v) {
  const start = parseDateValue(getProp(v, 'DTSTART'));
  if (!start) return null;
  let end = parseDateValue(getProp(v, 'DTEND'));
  const durProp = getProp(v, 'DURATION');
  let durationMs;
  if (start.allDay) {
    let endDay = end && end.allDay ? end.day : null;
    if (endDay === null && durProp) endDay = start.day + Math.round(parseDuration(durProp.value) / 86400000);
    if (endDay === null || endDay <= start.day) endDay = start.day + 1;
    durationMs = (endDay - start.day) * 86400000;
  } else {
    if (end && !end.allDay) durationMs = end.ms - start.ms;
    else if (durProp) durationMs = parseDuration(durProp.value);
    else durationMs = 0;
    if (!(durationMs >= 0)) durationMs = 0;
  }
  const rawTitle = unescapeText(getProp(v, 'SUMMARY')?.value || '');
  const deadline = IMPORTANT_RE.test(rawTitle) || !!getProp(v, 'X-MYCAL-DEADLINE');
  const title = rawTitle.replace(IMPORTANT_RE, '').trim();
  const rrule = parseRRule(getProp(v, 'RRULE')?.value);
  const exdates = getProps(v, 'EXDATE').flatMap(multiDateValues).filter(Boolean);
  const recId = parseDateValue(getProp(v, 'RECURRENCE-ID'));
  return {
    uid: getProp(v, 'UID')?.value || '',
    title: title || '(제목 없음)', deadline,
    location: unescapeText(getProp(v, 'LOCATION')?.value || ''),
    notes: unescapeText(getProp(v, 'DESCRIPTION')?.value || ''),
    url: getProp(v, 'URL')?.value || '',
    status: getProp(v, 'STATUS')?.value || '',
    start, durationMs, rrule, exdates, recId,
    alerts: alarmMinutes(v),
  };
}

function occKey(s) { return s.allDay ? `d${s.day}` : `t${s.ms}`; }

/**
 * 캘린더 리소스(ICS 텍스트) 하나를 [rangeStart, rangeEnd) 구간의 회차 목록으로 전개합니다.
 * 반환 회차: { info, startMs, endMs, allDay, startDay, endDay(포함), occurrence }
 */
export function expandResource(icsText, rangeStartMs, rangeEndMs) {
  const cal = parseICS(icsText);
  const vevents = cal.children.filter((c) => c.name === 'VEVENT');
  const infos = vevents.map(readVevent).filter(Boolean);
  const master = infos.find((i) => !i.recId) || null;
  const overrides = infos.filter((i) => i.recId);
  const out = [];
  const tz = config.tz;

  const pushOcc = (info, start, occurrence) => {
    let startMs, endMs, allDay = start.allDay, startDay, endDay;
    if (allDay) {
      startDay = start.day;
      endDay = start.day + Math.max(1, Math.round(info.durationMs / 86400000)) - 1;
      startMs = partsToUtc(...Object.values(dayToYmd(startDay)).slice(0, 3), 0, 0, 0, tz);
      endMs = partsToUtc(...Object.values(dayToYmd(endDay + 1)).slice(0, 3), 0, 0, 0, tz);
    } else {
      startMs = start.ms; endMs = start.ms + info.durationMs;
    }
    const overlaps = allDay || endMs > startMs ? (startMs < rangeEndMs && endMs > rangeStartMs) : (startMs >= rangeStartMs && startMs < rangeEndMs);
    if (!overlaps) return;
    out.push({ info, allDay, startMs, endMs, startDay, endDay, occurrence });
  };

  const overrideKeys = new Set(overrides.map((o) => occKey(o.recId)));

  if (master) {
    if (!master.rrule || !master.rrule.freq) {
      pushOcc(master, master.start, null);
    } else {
      const ex = new Set(master.exdates.map(occKey));
      const s = master.start;
      // 반복 계산은 일정의 원래 시간대 벽시계 기준
      const evTz = s.allDay ? null : (s.tz || tz);
      let startDay, hh = 0, mm = 0, ss = 0;
      if (s.allDay) startDay = s.day;
      else {
        const p = utcToParts(s.ms, evTz);
        startDay = ymdToDay(p.y, p.m, p.d); hh = p.hh; mm = p.mm; ss = p.ss;
      }
      const endLimitDay = Math.floor(rangeEndMs / 86400000) + 2;
      let untilDay = null;
      if (master.rrule.until) {
        if (master.rrule.until.allDay) untilDay = master.rrule.until.day;
        else {
          const up = utcToParts(master.rrule.until.ms, evTz || tz);
          untilDay = ymdToDay(up.y, up.m, up.d);
        }
      }
      const durDays = Math.ceil(master.durationMs / 86400000) + 1;
      for (const day of recurrenceDays(master.rrule, startDay, endLimitDay, untilDay)) {
        const occStart = s.allDay
          ? { allDay: true, day }
          : { allDay: false, ms: partsToUtc(...Object.values(dayToYmd(day)).slice(0, 3), hh, mm, ss, evTz) };
        if (!s.allDay && master.rrule.until && !master.rrule.until.allDay && occStart.ms > master.rrule.until.ms) break;
        const key = occKey(occStart);
        if (ex.has(key) || overrideKeys.has(key)) continue;
        // 범위 시작 훨씬 이전 회차는 빠르게 건너뜀
        if (day + durDays < Math.floor(rangeStartMs / 86400000) - 1) continue;
        pushOcc(master, occStart, s.allDay ? dayToDate(day) : new Date(occStart.ms).toISOString());
      }
    }
  }
  for (const o of overrides) {
    if (o.status === 'CANCELLED') continue;
    const base = master || o;
    const merged = { ...o, rrule: base.rrule };
    pushOcc(merged, o.start, o.recId.allDay ? dayToDate(o.recId.day) : new Date(o.recId.ms).toISOString());
  }
  return out;
}

/* ───────────── 생성 / 수정 ───────────── */

export function buildRRule(rec, allDay) {
  if (!rec || !rec.freq || rec.freq === 'NONE') return null;
  let s = `FREQ=${rec.freq.toUpperCase()}`;
  if (rec.interval && rec.interval > 1) s += `;INTERVAL=${rec.interval}`;
  if (rec.byday && rec.byday.length) s += `;BYDAY=${rec.byday.join(',')}`;
  if (rec.count) s += `;COUNT=${rec.count}`;
  else if (rec.until) {
    const d = rec.until.replace(/-/g, '');
    // 하루종일 일정은 DATE 형식, 시간 일정은 그날 23:59:59(앱 시간대) 를 UTC 로
    s += allDay ? `;UNTIL=${d}` : `;UNTIL=${fmtUtc(partsToUtc(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8), 23, 59, 59, config.tz))}`;
  }
  return s;
}

function makeAlarm(min) {
  return {
    name: 'VALARM',
    props: [
      { name: 'X-WR-ALARMUID', params: {}, value: crypto.randomUUID().toUpperCase() },
      { name: 'UID', params: {}, value: crypto.randomUUID().toUpperCase() },
      { name: 'TRIGGER', params: {}, value: minutesToTrigger(min) },
      { name: 'ACTION', params: {}, value: 'DISPLAY' },
      { name: 'DESCRIPTION', params: {}, value: 'Reminder' },
    ],
    children: [],
  };
}

/**
 * VEVENT에 사용자 입력 반영.
 * input: { title, deadline, allDay, startMs, endMs, startDay, endDayExclusive, location, notes, alerts, recurrence }
 * (undefined 인 항목은 건드리지 않음)
 */
function applyInput(v, input, { resetRecurrenceExtras }) {
  const now = fmtUtc(Date.now());
  if (input.title !== undefined || input.deadline !== undefined) {
    const cur = readVevent(v) || { title: '', deadline: false };
    const title = input.title !== undefined ? input.title : cur.title;
    const deadline = input.deadline !== undefined ? input.deadline : cur.deadline;
    setProp(v, 'SUMMARY', escapeText((deadline ? DEADLINE_PREFIX : '') + title));
    setProp(v, 'X-MYCAL-DEADLINE', deadline ? '1' : null);
  }
  if (input.startMs !== undefined || input.startDay !== undefined) {
    v.props = v.props.filter((p) => !['DTSTART', 'DTEND', 'DURATION'].includes(p.name));
    if (input.allDay) {
      v.props.push({ name: 'DTSTART', params: { VALUE: 'DATE' }, value: fmtDay(input.startDay) });
      v.props.push({ name: 'DTEND', params: { VALUE: 'DATE' }, value: fmtDay(input.endDayExclusive) });
    } else {
      v.props.push({ name: 'DTSTART', params: {}, value: fmtUtc(input.startMs) });
      v.props.push({ name: 'DTEND', params: {}, value: fmtUtc(input.endMs) });
    }
  }
  if (input.location !== undefined) setProp(v, 'LOCATION', input.location ? escapeText(input.location) : null);
  if (input.notes !== undefined) setProp(v, 'DESCRIPTION', input.notes ? escapeText(input.notes) : null);
  if (input.recurrence !== undefined) {
    const allDay = input.allDay !== undefined ? input.allDay : !!readVevent(v)?.start?.allDay;
    setProp(v, 'RRULE', buildRRule(input.recurrence, allDay));
  }
  if (resetRecurrenceExtras) setProp(v, 'EXDATE', null);
  if (input.alerts !== undefined) {
    v.children = v.children.filter((c) => c.name !== 'VALARM');
    for (const m of [...new Set(input.alerts)]) v.children.push(makeAlarm(m));
  }
  setProp(v, 'DTSTAMP', now);
  setProp(v, 'LAST-MODIFIED', now);
  const seq = +(getProp(v, 'SEQUENCE')?.value || 0);
  setProp(v, 'SEQUENCE', String(seq + 1));
}

export function buildNewEvent(input) {
  const uid = crypto.randomUUID().toUpperCase();
  const now = fmtUtc(Date.now());
  const v = {
    name: 'VEVENT',
    props: [
      { name: 'UID', params: {}, value: uid },
      { name: 'CREATED', params: {}, value: now },
    ],
    children: [],
  };
  applyInput(v, { alerts: [], ...input }, { resetRecurrenceExtras: false });
  setProp(v, 'SEQUENCE', '0');
  const cal = {
    name: 'VCALENDAR',
    props: [
      { name: 'VERSION', params: {}, value: '2.0' },
      { name: 'PRODID', params: {}, value: '-//MyCalendar//Web//KO' },
      { name: 'CALSCALE', params: {}, value: 'GREGORIAN' },
    ],
    children: [v],
  };
  return { uid, ics: serializeICS(cal) };
}

/** 기존 리소스의 마스터 일정 수정 */
export function updateEventICS(icsText, input) {
  const cal = parseICS(icsText);
  const vevents = cal.children.filter((c) => c.name === 'VEVENT');
  const master = vevents.find((c) => !getProp(c, 'RECURRENCE-ID')) || vevents[0];
  if (!master) throw new Error('일정 데이터를 찾을 수 없습니다.');
  const timingChanged = input.startMs !== undefined || input.startDay !== undefined || input.recurrence !== undefined;
  applyInput(master, input, { resetRecurrenceExtras: timingChanged && !!getProp(master, 'RRULE') });
  if (timingChanged) {
    // 일정 시간이 바뀌면 개별 회차 수정본은 더 이상 맞지 않으므로 제거
    cal.children = cal.children.filter((c) => c.name !== 'VEVENT' || c === master);
  }
  return serializeICS(cal);
}

/** 반복 일정의 한 회차만 삭제 (EXDATE 추가) */
export function excludeOccurrenceICS(icsText, occurrence) {
  const cal = parseICS(icsText);
  const master = cal.children.find((c) => c.name === 'VEVENT' && !getProp(c, 'RECURRENCE-ID'));
  if (!master) throw new Error('반복 일정 원본을 찾을 수 없습니다.');
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(occurrence);
  const prop = isDay
    ? { name: 'EXDATE', params: { VALUE: 'DATE' }, value: occurrence.replace(/-/g, '') }
    : { name: 'EXDATE', params: {}, value: fmtUtc(Date.parse(occurrence)) };
  master.props.push(prop);
  const key = isDay ? `d${dateToDay(occurrence)}` : `t${Date.parse(occurrence)}`;
  cal.children = cal.children.filter((c) => {
    if (c.name !== 'VEVENT' || c === master) return true;
    const r = parseDateValue(getProp(c, 'RECURRENCE-ID'));
    return !r || occKey(r) !== key;
  });
  applyInput(master, {}, { resetRecurrenceExtras: false });
  return serializeICS(cal);
}

export { describeRule };
