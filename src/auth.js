// 비밀번호 1개로 쓰는 개인용 로그인 (서명된 쿠키, 180일 유지)
import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'cal_session';
const MAX_AGE = 180 * 86400;

const sign = (payload) => crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');

export function issueCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function isAuthed(req) {
  if (!config.appPassword) return false;
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  const good = sign(payload);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

export function checkPassword(pw) {
  if (!config.appPassword) return false;
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(config.appPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

export function checkToken(token) {
  if (!config.mcpToken || !token) return false;
  const a = crypto.createHash('sha256').update(String(token)).digest();
  const b = crypto.createHash('sha256').update(config.mcpToken).digest();
  return crypto.timingSafeEqual(a, b);
}
