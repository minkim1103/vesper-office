// iCloud CalDAV 클라이언트 (fetch + 최소 XML 파서)
import { config } from './config.js';

/* ───────────── 아주 작은 XML 파서 ───────────── */

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

export function parseXML(xml) {
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const name = m[3].includes(':') ? m[3].split(':').pop() : m[3];
      const attrs = {};
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[a[1].includes(':') ? a[1].split(':').pop() : a[1]] = decode(a[2] ?? a[3] ?? '');
      }
      const el = { name, attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += decode(m[6]);
  }
  return root;
}
const kids = (el, name) => (el?.children || []).filter((c) => c.name === name);
const kid = (el, name) => kids(el, name)[0];
function find(el, name) {
  if (!el) return null;
  for (const c of el.children) {
    if (c.name === name) return c;
    const f = find(c, name);
    if (f) return f;
  }
  return null;
}
const textOf = (el) => (el ? (el.text + el.children.map(textOf).join('')).trim() : '');

/** multistatus → [{ href, status, props: {localName: element} }] */
function multistatus(xml) {
  const doc = parseXML(xml);
  const ms = find(doc, 'multistatus');
  if (!ms) return [];
  return kids(ms, 'response').map((r) => {
    const props = {};
    for (const ps of kids(r, 'propstat')) {
      const st = textOf(kid(ps, 'status'));
      if (st && !/ 2\d\d /.test(st + ' ')) continue;
      for (const p of kid(ps, 'prop')?.children || []) props[p.name] = p;
    }
    return { href: textOf(kid(r, 'href')), status: textOf(kid(r, 'status')), props };
  });
}

/* ───────────── HTTP ───────────── */

const authHeader = () => 'Basic ' + Buffer.from(`${config.icloudUser}:${config.icloudPassword}`).toString('base64');

async function dav(method, url, { body, depth, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: {
      Authorization: authHeader(),
      ...(body ? { 'Content-Type': method === 'PUT' ? 'text/calendar; charset=utf-8' : 'application/xml; charset=utf-8' } : {}),
      ...(depth !== undefined ? { Depth: String(depth) } : {}),
      ...headers,
    },
    body,
  });
  const text = await res.text();
  if (res.status === 401) throw Object.assign(new Error('iCloud 로그인 실패: Apple ID 또는 앱 암호를 확인하세요.'), { status: 502 });
  if (res.status === 412) throw Object.assign(new Error('다른 기기에서 먼저 수정된 일정입니다. 새로고침 후 다시 시도하세요.'), { status: 409 });
  if (res.status === 404) throw Object.assign(new Error('iCloud 에서 항목을 찾을 수 없습니다.'), { status: 404 });
  if (res.status >= 400) throw Object.assign(new Error(`iCloud 요청 실패 (${method} ${res.status})`), { status: 502, detail: text.slice(0, 300) });
  return { status: res.status, text, headers: res.headers, url: res.url };
}

const abs = (href, base) => new URL(href, base).toString();

/* ───────────── 캘린더 탐색 ───────────── */

let homeCache = null;
async function calendarHome() {
  if (homeCache) return homeCache;
  const r1 = await dav('PROPFIND', config.caldavRoot, {
    depth: 0,
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  });
  const principalHref = textOf(find(parseXML(r1.text), 'current-user-principal'));
  if (!principalHref) throw new Error('iCloud 사용자 정보를 찾지 못했습니다.');
  const principal = abs(principalHref, r1.url || config.caldavRoot);
  const r2 = await dav('PROPFIND', principal, {
    depth: 0,
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
  });
  const homeHref = textOf(find(parseXML(r2.text), 'calendar-home-set'));
  homeCache = abs(homeHref, principal);
  if (!homeCache.endsWith('/')) homeCache += '/';
  return homeCache;
}

function normColor(c) {
  const m = /#?([0-9a-fA-F]{6})/.exec(c || '');
  return m ? `#${m[1].toUpperCase()}` : null;
}

export async function listCalendars() {
  const home = await calendarHome();
  const r = await dav('PROPFIND', home, {
    depth: 1,
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">
  <d:prop><d:displayname/><d:resourcetype/><ic:calendar-color/><ic:calendar-order/><cs:getctag/>
  <c:supported-calendar-component-set/><d:current-user-privilege-set/></d:prop>
</d:propfind>`,
  });
  return multistatus(r.text)
    .filter((x) => x.props.resourcetype && find(x.props.resourcetype, 'calendar'))
    .filter((x) => {
      const comps = x.props['supported-calendar-component-set'];
      if (!comps) return true;
      const list = kids(comps, 'comp');
      return list.length === 0 || list.some((c) => (c.attrs?.name || '').toUpperCase() === 'VEVENT');
    })
    .map((x) => {
      const priv = JSON.stringify(x.props['current-user-privilege-set'] || '');
      return {
        url: abs(x.href, home),
        name: textOf(x.props.displayname) || '캘린더',
        color: normColor(textOf(x.props['calendar-color'])) || '#5B6CF0',
        order: +textOf(x.props['calendar-order']) || 0,
        ctag: textOf(x.props.getctag),
        readOnly: x.props['current-user-privilege-set'] ? !/"write"|write-content|"all"/.test(priv) : false,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/* ───────────── 일정 조회 / 쓰기 ───────────── */

const caldavTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function queryObjects(calUrl, startMs, endMs) {
  const r = await dav('REPORT', calUrl, {
    depth: 1,
    body: `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${caldavTime(startMs)}" end="${caldavTime(endMs)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`,
  });
  return multistatus(r.text)
    .filter((x) => x.props['calendar-data'])
    .map((x) => ({ href: abs(x.href, calUrl), etag: textOf(x.props.getetag), data: textOf(x.props['calendar-data']) }));
}

export async function getObject(href) {
  const r = await dav('GET', href);
  return { href, etag: r.headers.get('etag') || '', data: r.text };
}

export async function putObject(href, data, etag) {
  const headers = etag ? { 'If-Match': etag } : { 'If-None-Match': '*' };
  await dav('PUT', href, { body: data, headers });
}

export async function deleteObject(href, etag) {
  await dav('DELETE', href, { headers: etag ? { 'If-Match': etag } : {} });
}

const xmlEsc = (s) => String(s).replace(/[<>&"']/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`);

export async function createCalendar(name, color) {
  const home = await calendarHome();
  const url = `${home}${crypto.randomUUID().toUpperCase()}/`;
  await dav('MKCALENDAR', url, {
    body: `<?xml version="1.0"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">
  <d:set><d:prop>
    <d:displayname>${xmlEsc(name)}</d:displayname>
    <ic:calendar-color>${xmlEsc(color)}FF</ic:calendar-color>
    <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  </d:prop></d:set>
</c:mkcalendar>`,
  });
  return url;
}
