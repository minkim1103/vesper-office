import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import handler from '../src/handler.js';
import { config } from '../src/config.js';
import { checkPassword, isAuthed, issueCookie } from '../src/auth.js';
import { handleMcp } from '../src/mcp.js';
import { messages, t, locale } from '../public/i18n.js';
import fs from 'node:fs';

assert.equal(locale(), 'ko-KR');
assert.equal(t('Settings'), '설정');
assert.equal(t('A user-written title'), 'A user-written title');
globalThis.localStorage = { getItem: () => '"en"' };
assert.equal(locale(), 'en-US');
assert.equal(t('Settings'), 'Settings');
delete globalThis.localStorage;
const identities = new Set(['Sara', 'Vesper', 'Google', 'iCloud', 'MoS2', 'Google Calendar']);
for (const file of ['../public/index.html', '../public/app.js']) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const [, key] of source.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) assert.ok(messages[key] || identities.has(key), `Missing translation: ${key}`);
}

const savedPassword = config.appPassword;
const validCookie = issueCookie().split(';')[0];
config.appPassword = '';
assert.equal(checkPassword(''), false);
assert.equal(isAuthed({ headers: { cookie: validCookie } }), false);
config.appPassword = savedPassword;

const server = http.createServer(handler).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const get = (path, opts) => fetch(base + path, opts);
  const brand = await (await get('/api/branding')).json();
  assert.equal(brand.id, config.assistant);
  const manifest = await (await get('/api/manifest?assistant=chatgpt')).json();
  assert.equal(manifest.id, '/');
  assert.equal(manifest.name, 'Sara');
  assert.equal(manifest.short_name, 'Sara');
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/icons/chatgpt-')));
  const schema = await (await get('/api/actions/openapi.json')).json();
  assert.equal(schema.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(JSON.stringify(schema).includes(config.mcpToken), false);
  assert.equal((await get('/api/actions/briefing')).status, 401);
  assert.equal((await get('/api/actions/briefing', { headers: { cookie: validCookie } })).status, 401);
  assert.equal((await get('/api/actions/briefing', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const headers = { Authorization: `Bearer ${config.mcpToken}`, 'Content-Type': 'application/json' };
  assert.equal((await get('/api/actions/briefing', { headers })).status, 200);
  assert.equal((await get('/api/actions/briefing', { method: 'POST', headers })).status, 405);
  assert.equal((await get('/api/actions/daily-briefing', { method: 'POST', headers, body: '{}' })).status, 400);
  assert.equal((await get('/api/actions/daily-briefing', { method: 'POST', headers, body: '{"markdown":""}' })).status, 400);
  assert.equal((await get('/api/actions/daily-briefing', { method: 'POST', headers, body: '{"markdown":"# 오늘 브리핑"}' })).status, 200);
  const note = await (await get('/api/notes/daily', { headers: { cookie: validCookie } })).json();
  assert.equal(note.note.text, '# 오늘 브리핑');
  assert.equal((await get('/api/me')).status, 401);
  console.log('✓ Assistant: provider branding, authenticated Actions read/write, fail-closed login');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
