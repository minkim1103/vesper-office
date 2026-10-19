// Google Calendar API 클라이언트 (OAuth 리프레시 토큰 방식)
import crypto from 'node:crypto';
import { config } from './config.js';

const API = () => process.env.GOOGLE_API_BASE || 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

const fail = (msg, status = 502) => Object.assign(new Error(msg), { status });

/** 'off' = 설정 안 됨, 'ready' = 클라이언트만 있음(로그인 필요), 'connected' = 사용 가능 */
export function status() {
  if (!config.googleClientId || !config.googleClientSecret) return 'off';
  return config.googleRefreshToken ? 'connected' : 'ready';
}
export const enabled = () => status() === 'connected';

/* ───────────── OAuth ───────────── */

const sign = (s) => crypto.createHmac('sha256', config.sessionSecret).update('g-state:' + s).digest('base64url');
export function authUrl(redirectUri) {
  const ts = String(Date.now());
  const state = `${ts}.${sign(ts)}`;
  const q = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: redirectUri, response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `${AUTH_URL}?${q}`;
}
export function checkState(state) {
  const [ts, sig] = String(state || '').split('.');
  return !!ts && sig === sign(ts) && Date.now() - +ts < 15 * 60_000;
}
export async function exchangeCode(code, redirectUri) {
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, redirect_uri: redirectUri, grant_type: 'authorization_code',
      client_id: config.googleClientId, client_secret: config.googleClientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`Google 로그인 실패: ${data.error_description || data.error || res.status}`, 400);
  return data; // { access_token, refresh_token, ... }
}

let token = null; // { value, exp }
async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: config.googleRefreshToken,
      client_id: config.googleClientId, client_secret: config.googleClientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw fail('Google 연결이 만료됐습니다. 앱의 Calendars 메뉴에서 다시 연결하세요.');
    throw fail(`Google 인증 실패 (${data.error || res.status})`);
  }
  token = { value: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return token.value;
}

async function gapi(method, path, { query, body } = {}) {
  const url = `${API()}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.status === 410 && method === 'DELETE') return null; // 이미 삭제됨
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw fail(`Google 요청 실패: ${msg}`, res.status === 404 ? 404 : res.status === 412 ? 409 : 502);
  }
  return data;
}
const enc = encodeURIComponent;

/* ───────────── 캘린더 ───────────── */

export async function listCalendars() {
  const items = [];
  let pageToken;
  do {
    const r = await gapi('GET', '/users/me/calendarList', { query: { maxResults: '250', ...(pageToken ? { pageToken } : {}) } });
    items.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items
    .filter((c) => !c.deleted && !c.hidden)
    .map((c) => ({
      gid: c.id,
      name: c.summaryOverride || c.summary || c.id,
      color: (c.backgroundColor || '#4285F4').toUpperCase(),
      readOnly: !['owner', 'writer'].includes(c.accessRole),
      defaultReminders: (c.defaultReminders || []).filter((r) => r.method === 'popup').map((r) => r.minutes),
      primary: !!c.primary,
    }))
    .sort((a, b) => (b.primary - a.primary));
}

export async function createCalendar(name, color) {
  const cal = await gapi('POST', '/calendars', { body: { summary: name, timeZone: config.tz } });
  await gapi('PATCH', `/users/me/calendarList/${enc(cal.id)}`, { query: { colorRgbFormat: 'true' }, body: { backgroundColor: color, foregroundColor: '#FFFFFF' } });
  return cal.id;
}

/* ───────────── 일정 ───────────── */

export async function listInstances(gid, startMs, endMs) {
  const items = [];
  let pageToken;
  do {
    const r = await gapi('GET', `/calendars/${enc(gid)}/events`, {
      query: {
        timeMin: new Date(startMs).toISOString(), timeMax: new Date(endMs).toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', ...(pageToken ? { pageToken } : {}),
      },
    });
    items.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items.filter((e) => e.status !== 'cancelled');
}

export const getEvent = (gid, eid) => gapi('GET', `/calendars/${enc(gid)}/events/${enc(eid)}`);
export const insertEvent = (gid, body) => gapi('POST', `/calendars/${enc(gid)}/events`, { body });
export const patchEvent = (gid, eid, body) => gapi('PATCH', `/calendars/${enc(gid)}/events/${enc(eid)}`, { body });
export const deleteEvent = (gid, eid) => gapi('DELETE', `/calendars/${enc(gid)}/events/${enc(eid)}`);
export const moveEvent = (gid, eid, dest) => gapi('POST', `/calendars/${enc(gid)}/events/${enc(eid)}/move`, { query: { destination: dest } });
