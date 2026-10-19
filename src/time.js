// 시간대 도우미 (외부 라이브러리 없이 Intl만 사용)
import { config } from './config.js';

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return fmtCache.get(tz);
}

export function isValidTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** UTC ms → 해당 시간대의 벽시계 값 */
export function utcToParts(ms, tz = config.tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second,
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}

function offsetAt(ms, tz) {
  const p = utcToParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

/** 해당 시간대의 벽시계 값 → UTC ms */
export function partsToUtc(y, m, d, hh = 0, mm = 0, ss = 0, tz = config.tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ms = guess - offsetAt(guess, tz);
  const off2 = offsetAt(ms, tz);
  if (guess - off2 !== ms) ms = guess - off2;
  return ms;
}

export const pad = (n, w = 2) => String(n).padStart(w, '0');

// 날짜 문자열 ↔ "epoch 이후 일수" (하루종일 일정 계산용)
export function dateToDay(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function dayToDate(day) {
  const dt = new Date(day * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function dayToYmd(day) {
  const dt = new Date(day * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
export function ymdToDay(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }

export function todayStr(tz = config.tz) {
  const p = utcToParts(Date.now(), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export function addDays(dateStr, n) { return dayToDate(dateToDay(dateStr) + n); }

/** 'YYYY-MM-DD' + 'HH:mm' (앱 시간대) → UTC ms */
export function localToUtc(dateStr, timeStr = '00:00', tz = config.tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return partsToUtc(y, m, d, hh, mm, 0, tz);
}
export function utcToLocal(ms, tz = config.tz) {
  const p = utcToParts(ms, tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:${pad(p.mm)}` };
}

export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
export function koDate(dateStr) {
  const { m, d, dow } = dayToYmd(dateToDay(dateStr));
  return `${m}월 ${d}일 (${WEEKDAYS_KO[dow]})`;
}
