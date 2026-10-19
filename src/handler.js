// HTTP 라우터 — Vercel 함수와 로컬 서버가 함께 사용
import * as svc from './service.js';
import { handleMcp } from './mcp.js';
import { isAuthed, issueCookie, clearCookie, checkPassword, checkToken } from './auth.js';
import { config } from './config.js';
import * as google from './google.js';
import * as tasks from './tasks.js';
import { branding, manifest } from './branding.js';
import { actionsSchema } from './actions.js';

const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title><style>
:root{--paper:#FAF9F5;--surface:#fff;--ink:#141413;--ink2:#5E5D59;--line:#E8E6DC;--accent:#D97757}
@media (prefers-color-scheme:dark){:root{--paper:#262624;--surface:#30302E;--ink:#F5F4EE;--ink2:#C2C0B6;--line:#3D3D3A}}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:32px 20px}
main{max-width:560px;margin:0 auto}h1{font:500 28px/1.2 Georgia,serif;margin:0 0 16px}
ol{padding-left:20px;color:var(--ink2)}li{margin:6px 0}code{font-size:14px}
textarea{width:100%;box-sizing:border-box;height:96px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:13px ui-monospace,monospace;word-break:break-all}
button,a.btn{display:inline-block;margin-top:10px;height:44px;line-height:44px;padding:0 18px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-weight:600;font-size:15px;text-decoration:none;cursor:pointer}
</style></head><body><main>${body}</main></body></html>`);
}
function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}

async function readBody(req) {
  const chunks = [];
  try { for await (const c of req) chunks.push(c); } catch { /* 이미 읽힘 */ }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw) { try { return JSON.parse(raw); } catch { throw Object.assign(new Error('JSON 형식이 아닙니다.'), { status: 400 }); } }
  try { if (req.body && typeof req.body === 'object') return req.body; } catch { /* noop */ }
  return {};
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === null || body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// 로그인 시도 제한 (인스턴스 단위, 간단)
const attempts = new Map();
function tooMany(ip) {
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60_000) { a.n = 0; a.t = Date.now(); }
  a.n++; attempts.set(ip, a);
  return a.n > 10;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  // Vercel rewrite 로 들어온 경우 원래 경로 복원
  const path = url.searchParams.get('__p') ? '/' + url.searchParams.get('__p') : url.pathname;
  const method = req.method.toUpperCase();
  const q = Object.fromEntries(url.searchParams);

  try {
    if (path === '/api/branding' && method === 'GET') return send(res, 200, branding());
    if (path === '/api/manifest' && method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify(manifest(q.assistant)));
    }
    if (config.profile.actions && path === '/api/actions/openapi.json' && method === 'GET') return send(res, 200, actionsSchema(origin(req)));
    if (config.profile.actions && path.startsWith('/api/actions/')) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!/^Bearer\s+/i.test(req.headers.authorization || '') || !checkToken(token)) return send(res, 401, { error: 'unauthorized' });
      if (path === '/api/actions/briefing') {
        if (method !== 'GET') return send(res, 405, null, { Allow: 'GET' });
        return send(res, 200, { timezone: config.tz, ...await svc.briefing() });
      }
      if (path === '/api/actions/daily-briefing') {
        if (method !== 'POST') return send(res, 405, null, { Allow: 'POST' });
        const b = await readBody(req);
        if (typeof b.markdown !== 'string' || !b.markdown.trim() || b.markdown.length > 50000) return send(res, 400, { error: 'markdown must contain 1–50000 characters' });
        return send(res, 200, { saved: (await tasks.saveNote('daily', { text: b.markdown })).updatedAt });
      }
      return send(res, 404, { error: 'not found' });
    }
    /* ── Claude 연결 (MCP) ── */
    if (path.startsWith('/mcp')) {
      const token = path.split('/')[2] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!checkToken(token)) return send(res, 401, { error: 'unauthorized' });
      if (method === 'POST') {
        const { status, body } = await handleMcp(await readBody(req), { origin: origin(req) });
        return send(res, status, body);
      }
      if (method === 'GET' || method === 'DELETE') return send(res, 405, null, { Allow: 'POST' });
      return send(res, 204, null);
    }

    if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    /* ── 로그인 ── */
    if (path === '/api/login' && method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
      if (tooMany(ip)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      const { password } = await readBody(req);
      if (!checkPassword(password)) return send(res, 401, { error: 'Wrong password' });
      attempts.delete(ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': issueCookie() });
    }
    if (path === '/api/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });

    /* ── Google 연결 (브라우저로 여는 페이지) ── */
    if (path === '/api/google/connect' || path === '/api/google/callback') {
      if (!isAuthed(req)) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
      if (google.status() === 'off') {
        return page(res, 400, 'Google Calendar', '<h1>Google Calendar</h1><p>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first, then redeploy.</p>');
      }
      const redirectUri = `${origin(req)}/api/google/callback`;
      if (path === '/api/google/connect') {
        res.statusCode = 302; res.setHeader('Location', google.authUrl(redirectUri)); return res.end();
      }
      if (q.error) return page(res, 400, 'Google Calendar', `<h1>Not connected</h1><p>${escHtml(q.error)}</p><a class="btn" href="/">Back to Vesper</a>`);
      if (!google.checkState(q.state)) return page(res, 400, 'Google Calendar', '<h1>Link expired</h1><p>Start again from Calendars → Connect.</p><a class="btn" href="/">Back to Vesper</a>');
      const tok = await google.exchangeCode(q.code, redirectUri);
      if (!tok.refresh_token) {
        return page(res, 400, 'Google Calendar', '<h1>No token returned</h1><p>Remove Vesper at myaccount.google.com/permissions, then connect again.</p><a class="btn" href="/">Back to Vesper</a>');
      }
      return page(res, 200, 'Google Calendar', `<h1>Almost done</h1>
<p>Copy this token:</p>
<textarea id="t" readonly>${escHtml(tok.refresh_token)}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('t').value).then(()=>this.textContent='Copied')">Copy</button>
<ol>
<li>Vercel → your project → <b>Settings → Environment Variables</b></li>
<li>Add <code>GOOGLE_REFRESH_TOKEN</code> with this value</li>
<li><b>Deployments</b> → latest → <b>⋯ → Redeploy</b></li>
</ol>
<a class="btn" href="/">Back to Vesper</a>`);
    }

    const extension = { req, res, path, method, q, send, readBody, origin };
    if (await config.profile.publicRoute?.(extension)) return;
    if (!isAuthed(req)) return send(res, 401, { error: '로그인이 필요합니다.' });
    if (await config.profile.authedRoute?.(extension)) return;

    if (path === '/api/briefs') {
      if (method === 'GET') return send(res, 200, await tasks.listBriefs());
      if (method === 'POST') { const b = await readBody(req); return send(res, 200, { brief: await tasks.setBrief(b.eventId, b) }); }
    }

    /* ── 앱 API ── */
    if (path === '/api/me') {
      return send(res, 200, { ok: true, mode: svc.mode(), google: svc.googleStatus(), tz: config.tz, assistant: branding() });
    }

    /* ── Spaces (할 일) ── */
    if (path === '/api/areas') {
      if (method === 'GET') return send(res, 200, await tasks.listAreas());
      if (method === 'POST') { const b = await readBody(req); return send(res, 200, await tasks.editCategories(b.op, b)); }
    }
    if (path === '/api/topics') {
      if (method === 'GET') return send(res, 200, await tasks.listTopics());
      if (method === 'POST') { const b = await readBody(req); return send(res, 200, await tasks.editTopic(b.op, b)); }
    }
    if (path === '/api/notes' && method === 'POST') { const b = await readBody(req); return send(res, 200, { notes: await tasks.getNotes(Array.isArray(b.keys) ? b.keys : []) }); }
    const nm = /^\/api\/notes\/([^/]+)$/.exec(path);
    if (nm && method === 'GET') return send(res, 200, { note: await tasks.getNote(decodeURIComponent(nm[1])) });
    if (path === '/api/tasks') {
      if (method === 'GET') return send(res, 200, await tasks.listTasks({ area: q.area, topic: q.topic }));
      if (method === 'POST') return send(res, 201, await tasks.addTask(await readBody(req)));
    }
    const tm = /^\/api\/tasks\/([^/]+)$/.exec(path);
    if (tm) {
      if (method === 'PATCH') return send(res, 200, await tasks.updateTask(decodeURIComponent(tm[1]), await readBody(req)));
      if (method === 'DELETE') return send(res, 200, await tasks.deleteTask(decodeURIComponent(tm[1])));
    }


    if (path === '/api/categories') {
      if (method === 'GET') return send(res, 200, (await svc.listCategories()).map(svc.publicCategory));
      if (method === 'POST') {
        const b = await readBody(req);
        return send(res, 201, svc.publicCategory(await svc.createCategory(b.name, b.color)));
      }
    }

    if (path === '/api/events') {
      if (method === 'GET') {
        return send(res, 200, await svc.listEvents({
          from: q.from, to: q.to, query: q.q, categories: q.categories ? q.categories.split(',') : null,
        }));
      }
      if (method === 'POST') return send(res, 201, await svc.createEvent(await readBody(req)));
    }

    const m = /^\/api\/events\/([^/]+)$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return send(res, 200, await svc.getEvent(id));
      if (method === 'PATCH' || method === 'PUT') return send(res, 200, await svc.updateEvent(id, await readBody(req)));
      if (method === 'DELETE') return send(res, 200, await svc.deleteEvent(id, { occurrence: q.occurrence }));
    }

    if (path === '/api/briefing') return send(res, 200, await svc.briefing({ date: q.date, days: q.days ? +q.days : 14 }));

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    return send(res, status, { error: e.message || '서버 오류' });
  }
}
