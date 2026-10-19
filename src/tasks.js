// Spaces: 카테고리별 할 일 — iCloud 'Vesper' 캘린더에 일정으로 저장하고, 알람은 아이폰 기본 알림(VALARM)으로 울립니다.
import crypto from 'node:crypto';
import { DEFAULT_BRIEFING_STYLE } from './briefing-style.js';
import { config } from './config.js';
import * as svc from './service.js';
import {
  parseICS, serializeICS, escapeText, unescapeText, fmtUtc, fmtDay, minutesToTrigger, readVevent,
} from './ical.js';
import { localToUtc, utcToLocal, todayStr, addDays, dateToDay, dayToDate } from './time.js';

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(String(s), 'base64url').toString();
const CONFIG_UID = 'vesper-config';

const DEFAULT_AREAS = [
  { name: '업무', color: '#6A9BCC', subs: ['회의', '문서', '보고', '프로젝트'] },
  { name: '개인', color: '#D97790', subs: [] },
  { name: '집', color: '#7CA25A', subs: [] },
];
const PALETTE = ['#D97757', '#E3A13B', '#4C9A8F', '#8F7BC8', '#C46A9A', '#8F8D85'];

/* ───────────── Vesper 캘린더 ───────────── */

let calPromise = null;
async function vesperCal() {
  const find = async () => (await svc.listCategories({ includeHidden: true, includeVesper: true })).find((c) => c.vesper);
  let cal = await find();
  if (cal) return cal;
  if (!calPromise) {
    calPromise = (async () => {
      await svc.calendarStore().createCalendar(config.vesperCalendar, '#D97757');
      svc.clearCalendarCache();
      return find();
    })().finally(() => { calPromise = null; });
  }
  cal = await calPromise;
  if (!cal) throw fail(`'${config.vesperCalendar}' 캘린더를 만들지 못했습니다.`, 502);
  return cal;
}
const store = () => svc.calendarStore();

/* ───────────── Vesper 캘린더 안의 '문서' (설정·브리핑·노트를 JSON 으로 저장하는 숨은 일정) ───────────── */

const isDocUid = (uid) => String(uid || '').startsWith('vesper-');

async function loadDoc(uid) {
  const cal = await vesperCal();
  try {
    const obj = await store().getObject(`${cal.url}${uid}.ics`);
    const v = parseICS(obj.data).children.find((c) => c.name === 'VEVENT');
    const desc = unescapeText(v?.props.find((p) => p.name === 'DESCRIPTION')?.value || '');
    return { json: JSON.parse(desc.slice(desc.indexOf('{'))), etag: obj.etag, exists: true };
  } catch (e) {
    if (e.status && e.status !== 404 && !(e instanceof SyntaxError)) throw e;
    return { json: null, etag: null, exists: false };
  }
}

async function saveDoc(uid, title, json, prev) {
  const cal = await vesperCal();
  const now = fmtUtc(Date.now());
  const body = `${title} — managed by Vesper, do not edit.\n${JSON.stringify(json)}`;
  const ics = serializeICS({
    name: 'VCALENDAR',
    props: [{ name: 'VERSION', params: {}, value: '2.0' }, { name: 'PRODID', params: {}, value: '-//Vesper//Spaces//EN' }],
    children: [{
      name: 'VEVENT', children: [],
      props: [
        { name: 'UID', params: {}, value: uid },
        { name: 'DTSTAMP', params: {}, value: now },
        { name: 'DTSTART', params: { VALUE: 'DATE' }, value: '20000101' },
        { name: 'DTEND', params: { VALUE: 'DATE' }, value: '20000102' },
        { name: 'SUMMARY', params: {}, value: escapeText(title) },
        { name: 'DESCRIPTION', params: {}, value: escapeText(body) },
        { name: 'TRANSP', params: {}, value: 'TRANSPARENT' },
      ],
    }],
  });
  const p = prev || await loadDoc(uid);
  await store().putObject(`${cal.url}${uid}.ics`, ics, p.exists ? p.etag : undefined);
}

/* ───────────── 설정: 카테고리 + 프로젝트 ───────────── */

let configCache = null; // { areas, topics, etag, exists, exp }
async function loadConfig() {
  if (configCache && configCache.exp > Date.now()) return configCache;
  const d = await loadDoc(CONFIG_UID);
  configCache = {
    areas: d.json?.areas || structuredClone(DEFAULT_AREAS),
    topics: d.json?.topics || [],
    etag: d.etag, exists: d.exists, exp: Date.now() + 15_000,
  };
  return configCache;
}

async function saveConfig(areas, topics) {
  const cur = await loadConfig();
  await saveDoc(CONFIG_UID, 'Vesper settings', { areas: areas ?? cur.areas, topics: topics ?? cur.topics }, { etag: cur.etag, exists: cur.exists });
  configCache = null;
}

/** 카테고리 목록 (프론트·Claude 공용 형식) */
export async function listAreas() {
  const { areas } = await loadConfig();
  return areas.map((a) => ({ id: a.name, name: a.name, color: a.color, tags: a.subs || [] }));
}

function findArea(areas, ref) {
  if (!ref) return null;
  const r = String(ref).trim().toLowerCase();
  return areas.find((a) => a.name.toLowerCase() === r) || areas.find((a) => a.name.toLowerCase().includes(r) || r.includes(a.name.toLowerCase()));
}

/**
 * 카테고리 편집. op:
 *  add_area {name, color?, subs?} · add_sub {area, name} · rename_area {area, name} · rename_sub {area, sub, name}
 *  remove_area {area} · remove_sub {area, sub} · set_color {area, color}
 */
export async function editCategories(op, a = {}) {
  const { areas } = await loadConfig();
  const list = structuredClone(areas);
  const need = (ref) => { const x = findArea(list, ref); if (!x) throw fail(`'${ref}' 카테고리가 없습니다. 있는 것: ${list.map((y) => y.name).join(', ')}`); return x; };
  const renames = []; // [{ fromArea, toArea, fromSub, toSub }]
  switch (op) {
    case 'add_area': {
      if (!a.name?.trim()) throw fail('이름을 입력하세요.');
      if (list.some((x) => x.name === a.name.trim())) throw fail(`'${a.name}' 이미 있습니다.`);
      list.push({ name: a.name.trim(), color: a.color || PALETTE[list.length % PALETTE.length], subs: (a.subs || []).filter(Boolean) });
      break;
    }
    case 'add_sub': {
      const x = need(a.area);
      if (!a.name?.trim()) throw fail('하위 카테고리 이름을 입력하세요.');
      if (!x.subs.includes(a.name.trim())) x.subs.push(a.name.trim());
      break;
    }
    case 'rename_area': {
      const x = need(a.area);
      renames.push({ fromArea: x.name, toArea: a.name.trim() });
      x.name = a.name.trim();
      break;
    }
    case 'rename_sub': {
      const x = need(a.area);
      const i = x.subs.indexOf(a.sub);
      if (i < 0) throw fail(`'${a.sub}' 하위 카테고리가 없습니다.`);
      x.subs[i] = a.name.trim();
      renames.push({ fromArea: x.name, toArea: x.name, fromSub: a.sub, toSub: a.name.trim() });
      break;
    }
    case 'remove_area': {
      const x = need(a.area);
      const n = (await rawTasks()).filter((t) => t.area === x.name && !t.done).length;
      if (n) throw fail(`'${x.name}'에 진행 중인 할 일이 ${n}개 있어 지울 수 없습니다. 먼저 옮기거나 지우세요.`);
      list.splice(list.indexOf(x), 1);
      break;
    }
    case 'remove_sub': {
      const x = need(a.area);
      x.subs = x.subs.filter((s) => s !== a.sub);
      renames.push({ fromArea: x.name, toArea: x.name, fromSub: a.sub, toSub: null });
      break;
    }
    case 'set_color': need(a.area).color = a.color; break;
    default: throw fail(`알 수 없는 작업: ${op}`);
  }
  await saveConfig(list, null);
  // 이름이 바뀐 카테고리의 할 일도 함께 바꿈
  for (const r of renames) {
    for (const t of await rawTasks()) {
      if (t.area !== r.fromArea) continue;
      if (r.fromSub !== undefined && t.tag !== r.fromSub) continue;
      const patch = { area: r.toArea };
      if (r.fromSub !== undefined) patch.tag = r.toSub;
      await updateTask(t.id, patch, { skipCategoryCheck: true });
    }
  }
  return listAreas();
}

/* ───────────── 프로젝트 (Workstream) ─────────────
   주제 = 몇 주~몇 달 가는 프로젝트. 할 일에 주제를 연결하면 아이폰 캘린더 제목 앞에 [태그] 가 붙습니다.
   아이폰에서 직접 넣은 일정도 제목이 [태그] 로 시작하면 그 주제로 연결됩니다. */

const TOPIC_PALETTE = ['#6A9BCC', '#7C9A5A', '#C46A9A', '#E3A13B', '#4C9A8F', '#8F7BC8', '#D97757'];
const STATUSES = ['planned', 'active', 'closed'];
const normTag = (s) => String(s || '').trim().replace(/^\[|\]$/g, '').replace(/^#/, '').trim();

export function findTopic(topics, ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  const r = normTag(ref).toLowerCase();
  return topics.find((t) => t.id === ref)
    || topics.find((t) => t.tag.toLowerCase() === r)
    || topics.find((t) => t.name.toLowerCase() === r)
    || topics.find((t) => t.name.toLowerCase().includes(r) || r.includes(t.tag.toLowerCase()));
}

export async function listTopics() {
  return (await loadConfig()).topics;
}

/**
 * 주제 편집. op: create {name, tag?, ...} · update {topic, ...바꿀 것} · delete {topic}
 * 필드: name, tag, color, status(planned|active|closed), start(YYYY-MM-DD), target, brief(요약), keywords[]
 */
export async function editTopic(op, a = {}) {
  const cfg = await loadConfig();
  const topics = structuredClone(cfg.topics);
  const need = (ref) => { const x = findTopic(topics, ref); if (!x) throw fail(`'${ref}' 주제가 없습니다. 있는 것: ${topics.map((y) => y.name).join(', ') || '(없음)'}`); return x; };
  const clean = (x, src) => {
    if (src.name !== undefined) { if (!String(src.name).trim()) throw fail('주제 이름을 입력하세요.'); x.name = String(src.name).trim(); }
    if (src.tag !== undefined) {
      const tag = normTag(src.tag);
      if (!tag) throw fail('태그를 입력하세요. 예: Q4');
      if (/[\[\],]/.test(tag) || tag.length > 20) throw fail('태그는 20자 이내, [ ] , 없이 입력하세요.');
      if (topics.some((y) => y !== x && y.tag.toLowerCase() === tag.toLowerCase())) throw fail(`[${tag}] 태그를 이미 다른 주제가 쓰고 있습니다.`);
      x.tag = tag;
    }
    if (src.color !== undefined) x.color = src.color;
    if (src.status !== undefined) {
      const st = String(src.status).toLowerCase().replace('in progress', 'active').replace('progress', 'active').replace('done', 'closed');
      if (!STATUSES.includes(st)) throw fail('상태는 planned / active / closed 중 하나입니다.');
      x.status = st;
    }
    for (const k of ['start', 'target']) {
      if (src[k] !== undefined) { if (src[k] && !/^\d{4}-\d{2}-\d{2}$/.test(src[k])) throw fail(`${k} 는 YYYY-MM-DD 형식입니다.`); x[k] = src[k] || null; }
    }
    if (src.brief !== undefined) x.brief = String(src.brief || '');
    if (src.keywords !== undefined) x.keywords = (Array.isArray(src.keywords) ? src.keywords : String(src.keywords).split(',')).map((k) => String(k).trim()).filter(Boolean);
  };
  let result, retag = null, unlink = null;
  if (op === 'create') {
    const x = { id: crypto.randomBytes(4).toString('hex'), name: '', tag: '', color: TOPIC_PALETTE[topics.length % TOPIC_PALETTE.length], status: 'active', start: todayStr(), target: null, brief: '', keywords: [] };
    clean(x, { ...a, tag: a.tag ?? String(a.name || '').split(/\s+/)[0] });
    topics.push(x); result = x;
  } else if (op === 'update') {
    const x = need(a.topic ?? a.id);
    const oldTag = x.tag;
    clean(x, a);
    if (x.tag !== oldTag) retag = x.id;
    result = x;
  } else if (op === 'delete') {
    const x = need(a.topic ?? a.id);
    topics.splice(topics.indexOf(x), 1);
    unlink = x; result = { deleted: x.name };
  } else throw fail(`알 수 없는 작업: ${op}`);
  // 바꾸기 전 설정 기준으로 연결된 할 일 찾기 ([태그] 로만 연결된 것 포함)
  const affectedId = retag || unlink?.id;
  const linked = affectedId ? (await rawTasks()).filter((t) => resolveTopic(t, cfg.topics)?.id === affectedId) : [];
  await saveConfig(null, topics);
  // 태그가 바뀌거나 주제를 지우면, 연결된 할 일의 제목 앞 [태그] 도 다시 씀
  for (const t of linked) {
    if (retag) await updateTask(t.id, { topic: retag }, { skipCategoryCheck: true });
    else await updateTask(t.id, { topic: null }, { skipCategoryCheck: true });
  }
  return result;
}

/* ───────────── 브리핑 · 노트 ───────────── */

// briefing = Workstream 프로젝트 브리핑, daily = 캘린더 일정 브리핑, 그 밖 = 주제 id
const FIXED_NOTES = { briefing: ['vesper-briefing', 'Project briefing'], daily: ['vesper-daily', 'Daily briefing'], prefs: ['vesper-prefs', 'Assistant notes'], 'briefing-style': ['vesper-briefing-style', 'Personal briefing style'] };
const isTaskKey = (key) => /^(task|ev)-[A-Za-z0-9-]{4,80}$/.test(String(key || '')); // 할 일 노트·일정 브리핑 노트
const noteUid = (key) => (FIXED_NOTES[key] ? FIXED_NOTES[key][0] : isTaskKey(key) ? `vesper-${key}` : `vesper-note-${key}`);

/** 할 일 참조(id·uid·제목)를 찾아 노트 키('task-<uid>')로 */
export async function taskNoteKey(ref) {
  const r = String(ref || '').trim();
  if (isTaskKey(r)) return r;
  const list = await listTasks({ includeDone: true });
  const norm = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const t = list.find((x) => x.id === r || x.uid === r)
    || list.find((x) => norm(x.title) === norm(r))
    || (list.filter((x) => norm(x.title).includes(norm(r))).length === 1 ? list.find((x) => norm(x.title).includes(norm(r))) : null);
  if (!t) throw fail(`'${r}' 할 일을 찾을 수 없습니다. list_tasks 로 정확한 제목이나 uid 를 확인하세요.`, 404);
  return { key: `task-${t.uid}`, task: t };
}

/** key: 'briefing' | 'daily' | 'prefs'(비서 학습 메모) | 'task-<uid>'(할 일 노트) | 주제 id */
export async function getNote(key) {
  if (!FIXED_NOTES[key] && !isTaskKey(key)) { const t = findTopic(await listTopics(), key); if (!t) throw fail('주제를 찾을 수 없습니다.', 404); key = t.id; }
  const d = await loadDoc(noteUid(key));
  return d.json || null;
}

/** 여러 노트를 한 번에 (앱이 미리 받아 두는 용도). 없는 노트는 null */
export async function getNotes(keys = []) {
  keys = [...new Set(keys.map(String))].slice(0, 120);
  let topics = null;
  const out = {};
  await Promise.all(keys.map(async (key) => {
    try {
      let k = key;
      if (!FIXED_NOTES[k] && !isTaskKey(k)) { topics = topics || listTopics(); const t = findTopic(await topics, k); if (!t) { out[key] = null; return; } k = t.id; }
      out[key] = (await loadDoc(noteUid(k))).json || null;
    } catch { /* 실패한 건 빼서 앱이 따로 다시 받게 */ }
  }));
  return out;
}

/** Personal preferences live in the user's own calendar, never in the shared repository. */
export async function getBriefingStyle() {
  const [custom, feedback] = await Promise.all([getNote('briefing-style'), getNote('prefs')]);
  return {
    defaultInstructions: DEFAULT_BRIEFING_STYLE,
    personalInstructions: custom?.text || '',
    feedbackNotes: feedback?.text || '',
    precedence: '현재 사용자의 명시적 요청 > 저장된 개인 지시 > 기본 가이드. 사실 정확성과 일정·할 일 임의 변경 금지는 항상 유지합니다.',
    updatedAt: custom?.updatedAt || null,
  };
}

export async function saveBriefingStyle(markdown) {
  if (typeof markdown !== 'string' || markdown.length > 12000) throw fail('개인 지시는 12000자 이하의 문자열이어야 합니다.');
  const doc = { text: markdown.trim(), updatedAt: Date.now() };
  await saveDoc('vesper-briefing-style', 'Personal briefing style', doc);
  return { saved: doc.updatedAt, reset: !doc.text };
}

/** 브리핑 재료(제목+메모)의 지문. 노트에 같이 저장해 두고, 메모가 바뀌면 다시 브리핑 */
export const srcHash = (title, notes) => crypto.createHash('sha1').update(`${String(title || '').trim()}\n${String(notes || '').trim()}`).digest('hex').slice(0, 12);

/** 기존 노트에 지문만 새로 기록 (예전 노트의 기준점) */
export async function stampNote(key, src) {
  const d = await loadDoc(noteUid(key));
  if (!d.json) return null;
  const doc = { ...d.json, src };
  await saveDoc(noteUid(key), `AI note · ${doc.title || key.split('-')[0]}`, doc, d);
  return doc;
}

export async function saveNote(key, { text, url, title, src } = {}) {
  if (!String(text || '').trim()) throw fail('내용이 비어 있습니다.');
  let label = FIXED_NOTES[key]?.[1];
  if (isTaskKey(key)) label = `AI note · ${title || key.split('-')[0]}`;
  else if (!FIXED_NOTES[key]) {
    const t = findTopic(await listTopics(), key);
    if (!t) throw fail(`'${key}' 주제가 없습니다.`);
    key = t.id; label = `AI note · ${t.name}`;
  }
  const doc = { text: String(text), url: url && /^https:\/\//.test(url) ? url : null, title: title || null, updatedAt: Date.now(), ...(src ? { src } : {}) };
  await saveDoc(noteUid(key), label, doc);
  return doc;
}

/* ───────────── 일정 ↔ 할 일 변환 ───────────── */

const prop = (v, name) => v.props.find((p) => p.name === name);
const DONE_MARK = '✓ ';

function alarmToMs(a) { return localToUtc(a.slice(0, 10), a.slice(11, 16)); }

function parseTask(href, etag, data) {
  const cal = parseICS(data);
  const v = cal.children.find((c) => c.name === 'VEVENT' && !prop(c, 'RECURRENCE-ID'));
  if (!v || isDocUid(prop(v, 'UID')?.value)) return null;
  const info = readVevent(v);
  if (!info) return null;
  const x = (n) => { const p = prop(v, n); return p ? unescapeText(p.value) : null; };
  const cats = (x('CATEGORIES') || '').split(',').map((s) => s.trim()).filter(Boolean);
  let title = info.title;
  const doneByTitle = title.startsWith(DONE_MARK.trim());
  if (doneByTitle) title = title.slice(DONE_MARK.trim().length).trim();
  // 제목 앞 [태그] → 주제 (실제 주제와 맞는지는 decorate 에서 확인)
  let prefixTag = null;
  const pm = /^\[([^\]]{1,20})\]\s*/.exec(title);
  if (pm) { prefixTag = pm[1].trim(); title = title.slice(pm[0].length).trim() || title; }

  // 시작 시각(알람 기준점)
  const startMs = info.start.allDay ? localToUtc(dayToDate(info.start.day)) : info.start.ms;
  const noDate = x('X-VESPER-NODATE') === '1';
  let due = null;
  if (!noDate) {
    due = info.start.allDay ? { date: dayToDate(info.start.day), time: null } : (() => { const l = utcToLocal(info.start.ms); return { date: l.date, time: l.time }; })();
  }
  const storedAlarms = x('X-VESPER-ALARMS');
  const alarms = storedAlarms !== null
    ? storedAlarms.split(',').map((s) => s.trim()).filter(Boolean)
    : info.alerts.map((min) => { const l = utcToLocal(startMs - min * 60_000); return `${l.date}T${l.time}`; });
  const doneAt = x('X-VESPER-DONE');
  const created = prop(v, 'CREATED')?.value;
  return {
    id: b64(href), href, etag, uid: info.uid,
    title, area: x('X-VESPER-AREA') || cats[0] || '', tag: x('X-VESPER-TAG') ?? (cats[1] || null),
    notes: info.notes || '', due, alarms: [...new Set(alarms)].sort(),
    done: !!doneAt || doneByTitle, doneAt: doneAt ? +doneAt : null,
    createdAt: created ? Date.parse(created.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z')) || null : null,
    source: x('X-VESPER-SOURCE') || 'app',
    topic: x('X-VESPER-TOPIC') || null, prefixTag,
    start: x('X-VESPER-START') || null,
    anchorDate: info.start.allDay ? dayToDate(info.start.day) : utcToLocal(info.start.ms).date, // 날짜 없는 할 일이 놓인 날
  };
}

function buildTaskICS(t, topics = []) {
  const now = fmtUtc(Date.now());
  const p = (name, value, params = {}) => ({ name, params, value });
  const props = [p('UID', t.uid), p('DTSTAMP', now), p('LAST-MODIFIED', now), p('CREATED', fmtUtc(t.createdAt || Date.now()))];
  const topic = t.topic ? topics.find((x) => x.id === t.topic) : null;
  const prefix = topic ? `[${topic.tag}] ` : (t.prefixTag ? `[${t.prefixTag}] ` : '');
  props.push(p('SUMMARY', escapeText((t.done ? DONE_MARK : '') + prefix + t.title)));
  let startMs;
  if (t.due && t.due.time) {
    startMs = localToUtc(t.due.date, t.due.time);
    props.push(p('DTSTART', fmtUtc(startMs)), p('DTEND', fmtUtc(startMs + 30 * 60_000)));
  } else {
    const date = t.due ? t.due.date : (t.anchorDate || todayStr());
    startMs = localToUtc(date);
    props.push(p('DTSTART', fmtDay(dateToDay(date)), { VALUE: 'DATE' }), p('DTEND', fmtDay(dateToDay(date) + 1), { VALUE: 'DATE' }));
    if (!t.due) props.push(p('X-VESPER-NODATE', '1'));
  }
  if (t.notes) props.push(p('DESCRIPTION', escapeText(t.notes)));
  props.push(p('CATEGORIES', [t.area, t.tag].filter(Boolean).map((s) => s.replace(/,/g, ' ')).join(',')));
  props.push(p('X-VESPER-AREA', escapeText(t.area)));
  if (t.tag) props.push(p('X-VESPER-TAG', escapeText(t.tag)));
  props.push(p('X-VESPER-ALARMS', t.alarms.join(',')));
  props.push(p('X-VESPER-SOURCE', t.source || 'app'));
  if (t.done) props.push(p('X-VESPER-DONE', String(t.doneAt || Date.now())));
  if (topic) props.push(p('X-VESPER-TOPIC', topic.id));
  if (t.start) props.push(p('X-VESPER-START', t.start));
  props.push(p('TRANSP', 'TRANSPARENT'));

  // 완료 전이면 아이폰 알림(VALARM)으로 등록
  const children = t.done ? [] : t.alarms.map((a) => ({
    name: 'VALARM', children: [],
    props: [
      p('UID', crypto.randomUUID().toUpperCase()),
      p('TRIGGER', minutesToTrigger(Math.round((startMs - alarmToMs(a)) / 60_000))),
      p('ACTION', 'DISPLAY'),
      p('DESCRIPTION', escapeText(t.title)),
    ],
  }));
  return serializeICS({
    name: 'VCALENDAR',
    props: [p('VERSION', '2.0'), p('PRODID', '-//Vesper//Spaces//EN'), p('CALSCALE', 'GREGORIAN')],
    children: [{ name: 'VEVENT', props, children }],
  });
}

/* ───────────── 조회 ───────────── */

let tasksCache = null; // { list, exp }
async function rawTasks() {
  if (tasksCache && tasksCache.exp > Date.now()) return tasksCache.list;
  const cal = await vesperCal();
  const now = Date.now();
  const objs = await store().queryObjects(cal.url, now - 400 * 86400_000, now + 1500 * 86400_000);
  const list = objs.map((o) => { try { return parseTask(o.href, o.etag, o.data); } catch { return null; } }).filter(Boolean);
  tasksCache = { list, exp: Date.now() + 15_000 };
  return list;
}
const invalidate = () => { tasksCache = null; };

/** 할 일의 주제 찾기: 저장된 주제 id → 없으면 제목 앞 [태그] */
function resolveTopic(t, topics) {
  if (t.topic) { const x = topics.find((y) => y.id === t.topic); if (x) return x; }
  if (t.prefixTag) return topics.find((y) => y.tag.toLowerCase() === t.prefixTag.toLowerCase()) || null;
  return null;
}

function decorate(t, cfg) {
  const { areas, topics = [] } = cfg;
  const area = areas.find((a) => a.name === t.area) || { name: t.area || '기타', color: '#8F8D85' };
  const topic = resolveTopic(t, topics);
  const now = Date.now();
  const nextAlarm = t.alarms.filter((a) => alarmToMs(a) > now).sort()[0] || null;
  let dueMs = null;
  if (t.due) dueMs = t.due.time ? localToUtc(t.due.date, t.due.time) : localToUtc(addDays(t.due.date, 1)) - 1;
  const { href, etag, anchorDate, prefixTag, topic: _tp, ...rest } = t; // uid 는 할 일 노트 키로 씀
  // 주제와 안 맞는 [ ] 는 제목의 일부로 되돌림
  const title = !topic && prefixTag ? `[${prefixTag}] ${t.title}` : t.title;
  return {
    ...rest, title, areaId: area.name, area: area.name, areaColor: area.color, nextAlarm,
    topicId: topic?.id || null, topicName: topic?.name || null, topicTag: topic?.tag || null, topicColor: topic?.color || null,
    start: t.start || null,
    sent: t.alarms.filter((a) => alarmToMs(a) <= now), // 이미 지난 알람
    overdue: !t.done && dueMs !== null && dueMs < now,
    dday: t.due ? dateToDay(t.due.date) - dateToDay(todayStr()) : null,
  };
}

export async function listTasks({ area, tag, topic, includeDone = true } = {}) {
  const [list, cfg] = await Promise.all([rawTasks(), loadConfig()]);
  const { areas } = cfg;
  let out = list;
  if (topic) {
    const tp = findTopic(cfg.topics, topic);
    if (!tp) throw fail(`'${topic}' 주제가 없습니다.`);
    out = out.filter((t) => resolveTopic(t, cfg.topics)?.id === tp.id);
  }
  if (area) { const a = findArea(areas, area); if (!a) throw fail(`'${area}' 카테고리가 없습니다.`); out = out.filter((t) => t.area === a.name); }
  if (tag) out = out.filter((t) => t.tag === tag);
  if (!includeDone) out = out.filter((t) => !t.done);
  const key = (t) => (t.due ? `${t.due.date}T${t.due.time || '99:99'}` : '9999');
  return out.map((t) => decorate(t, cfg))
    .sort((a, b) => (a.done - b.done) || key(a).localeCompare(key(b)) || (a.createdAt || 0) - (b.createdAt || 0));
}

/* ───────────── 추가 / 수정 / 삭제 ───────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
const normTime = (t) => { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}`; };
function normAlarm(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/.exec(String(s).trim());
  if (!m) throw fail(`알람 시각 형식이 잘못됐습니다: ${s} (예: 2026-11-02 09:00)`);
  return `${m[1]}T${normTime(m[2])}`;
}
/** 알람을 따로 정하지 않았을 때: 마감 전날 09:00 + 마감 당일 09:00 (지난 것 제외) */
function defaultAlarms(due) {
  if (!due) return [];
  const now = Date.now();
  return [`${addDays(due.date, -1)}T09:00`, `${due.date}T09:00`].filter((a) => alarmToMs(a) > now);
}

async function applyInput(t, raw, { skipCategoryCheck } = {}) {
  if (raw.title !== undefined) {
    if (!String(raw.title).trim()) throw fail('제목을 입력하세요.');
    let title = String(raw.title).trim();
    // 제목에 [태그] 를 직접 썼으면 주제로 해석
    const pm = /^\[([^\]]{1,20})\]\s*/.exec(title);
    if (pm && raw.topic === undefined) {
      const tp = findTopic((await loadConfig()).topics, pm[1]);
      if (tp) { t.topic = tp.id; title = title.slice(pm[0].length).trim() || title; t.prefixTag = null; }
    }
    t.title = title;
  }
  if (raw.topic !== undefined) {
    if (raw.topic === null || raw.topic === '' || raw.topic === 'none') {
      t.topic = null; t.prefixTag = null;
    } else {
      const tp = findTopic((await loadConfig()).topics, raw.topic);
      if (!tp) throw fail(`'${raw.topic}' 주제가 없습니다. (새로 만들려면 edit_topic)`);
      t.topic = tp.id; t.prefixTag = null;
    }
  }
  const startDate = raw.startDate !== undefined ? raw.startDate : raw.start;
  if (startDate !== undefined) {
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw fail('시작 날짜는 YYYY-MM-DD 형식이어야 합니다.');
    t.start = startDate || null;
  }
  const areaRef = raw.area ?? raw.areaId;
  if (areaRef !== undefined || raw.tag !== undefined) {
    const { areas } = await loadConfig();
    if (areaRef !== undefined) {
      const a = findArea(areas, areaRef);
      if (!a && !skipCategoryCheck) throw fail(`'${areaRef}' 카테고리가 없습니다. 있는 것: ${areas.map((x) => x.name).join(', ')} (새로 만들려면 edit_categories)`);
      t.area = a ? a.name : String(areaRef);
    }
    if (raw.tag !== undefined) t.tag = raw.tag ? String(raw.tag).trim() : null;
    // 처음 보는 하위 카테고리는 자동으로 추가
    const a = findArea(areas, t.area);
    if (!skipCategoryCheck && a && t.tag && !(a.subs || []).includes(t.tag)) await editCategories('add_sub', { area: a.name, name: t.tag });
  }
  if (raw.notes !== undefined) t.notes = raw.notes ? String(raw.notes) : '';
  const dueDate = raw.dueDate !== undefined ? raw.dueDate : raw.due_date;
  const dueTime = raw.dueTime !== undefined ? raw.dueTime : raw.due_time;
  if (dueDate !== undefined) {
    if (!dueDate) t.due = null;
    else {
      if (!DATE_RE.test(dueDate)) throw fail('마감 날짜는 YYYY-MM-DD 형식이어야 합니다.');
      if (dueTime && !TIME_RE.test(dueTime)) throw fail('마감 시각은 HH:mm 형식이어야 합니다.');
      t.due = { date: dueDate, time: dueTime ? normTime(dueTime) : null };
    }
  } else if (dueTime !== undefined && t.due) {
    t.due = { ...t.due, time: dueTime ? normTime(dueTime) : null };
  }
  if (raw.alarms !== undefined) {
    if (!Array.isArray(raw.alarms)) throw fail('alarms 는 배열이어야 합니다.');
    t.alarms = [...new Set(raw.alarms.map(normAlarm))].sort();
  }
  if (raw.done !== undefined) {
    t.done = !!raw.done;
    t.doneAt = t.done ? (t.doneAt || Date.now()) : null;
  }
  return t;
}

export async function addTask(raw) {
  const cal = await vesperCal();
  const { areas } = await loadConfig();
  const t = { uid: crypto.randomUUID().toUpperCase(), title: '', area: areas[0]?.name || '', tag: null, notes: '', due: null, alarms: [], done: false, doneAt: null, createdAt: Date.now(), source: raw.source || 'app', topic: null, start: null, prefixTag: null };
  const input = { ...raw };
  // 프로젝트에 넣는 할 일은 카테고리를 안 정했으면 업무 › 프로젝트
  const research = areas.find((x) => (x.subs || []).includes('프로젝트')) || areas.find((x) => x.name === '업무');
  const hasTopic = (raw.topic && raw.topic !== 'none') || /^\[[^\]]{1,20}\]/.test(String(raw.title || ''));
  if ((input.area ?? input.areaId) === undefined) input.area = hasTopic && research ? research.name : areas[0]?.name;
  if (hasTopic && research && input.tag === undefined && findArea(areas, input.area)?.name === research.name && (research.subs || []).includes('프로젝트')) input.tag = '프로젝트';
  await applyInput(t, input);
  if (!t.title) throw fail('제목을 입력하세요.');
  if (raw.alarms === undefined) t.alarms = defaultAlarms(t.due);
  // 시작일을 안 정한 프로젝트 할 일: 마감 일주일 전부터 (오늘 이전이면 오늘)
  if (t.topic && !t.start && t.due) { const wk = addDays(t.due.date, -6); t.start = wk > todayStr() ? wk : (todayStr() <= t.due.date ? todayStr() : t.due.date); }
  const href = `${cal.url}${t.uid}.ics`;
  const cfg = await loadConfig();
  await store().putObject(href, buildTaskICS(t, cfg.topics));
  invalidate();
  return decorate({ ...t, id: b64(href) }, cfg);
}

async function findTask(id) {
  const href = unb64(id);
  const obj = await store().getObject(href);
  const t = parseTask(href, obj.etag, obj.data);
  if (!t) throw fail('할 일을 찾을 수 없습니다.', 404);
  return t;
}

export async function updateTask(id, raw, opts = {}) {
  const t = await findTask(id);
  const cfg0 = await loadConfig();
  // [태그] 로만 연결돼 있던 할 일은 주제 id 로 고정
  if (!t.topic && t.prefixTag) { const tp = resolveTopic(t, cfg0.topics); if (tp) { t.topic = tp.id; t.prefixTag = null; } }
  await applyInput(t, raw, opts);
  const cfg = await loadConfig();
  await store().putObject(t.href, buildTaskICS(t, cfg.topics), t.etag);
  invalidate();
  return decorate(t, cfg);
}

export async function deleteTask(id) {
  const t = await findTask(id);
  await store().deleteObject(t.href, t.etag);
  invalidate();
  return { ok: true, title: t.title };
}

/* ───────────── 브리핑용 ───────────── */

export async function tasksForBriefing(today = todayStr(), days = 7) {
  const list = await listTasks({ includeDone: false });
  const limit = addDays(today, days);
  return {
    overdue: list.filter((t) => t.overdue),
    upcoming: list.filter((t) => !t.overdue && t.due && t.due.date <= limit),
    alarmsToday: list.filter((t) => t.alarms.some((a) => a.startsWith(today))),
  };
}

/** 브리핑·Claude 용: 진행 중/예정 주제와 열린 할 일 */
export async function topicsForBriefing(today = todayStr()) {
  const [topics, list] = await Promise.all([listTopics(), listTasks({ includeDone: false })]);
  return topics.filter((t) => t.status !== 'closed').map((t) => {
    const open = list.filter((x) => x.topicId === t.id);
    return {
      name: t.name, tag: t.tag, status: t.status, start: t.start, target: t.target, brief: t.brief, keywords: t.keywords,
      openTasks: open.map((x) => ({ title: x.title, due: x.due ? x.due.date : null, dday: x.dday })),
      nextDue: open.filter((x) => x.due && x.due.date >= today)[0]?.title || null,
    };
  });
}

/* ───────────── 일정 브리핑: 일정 편집에서 "Claude briefing" 을 켜 둔 일반 일정 ─────────────
   vesper-event-briefs → { items: { [eventId]: { key, title, date, notes, updatedAt } } } */
const BRIEFS_UID = 'vesper-event-briefs';
export const eventNoteKey = (eventId) => `ev-${crypto.createHash('sha1').update(String(eventId)).digest('hex').slice(0, 20)}`;

export async function listBriefs() {
  const d = await loadDoc(BRIEFS_UID);
  return d.json?.items || {};
}

/** on=false 면 해제. title/date/notes 는 브리핑 재료(일정 메모)로 같이 보관 */
export async function setBrief(eventId, { on = true, title = '', date = '', notes = '' } = {}) {
  if (!eventId) throw fail('eventId 가 필요합니다.');
  const prev = await loadDoc(BRIEFS_UID);
  const doc = prev.json?.items ? prev.json : { items: {} };
  if (!on) delete doc.items[eventId];
  else {
    const old = doc.items[eventId] || {};
    const next = { key: eventNoteKey(eventId), title: String(title).slice(0, 300), date: String(date).slice(0, 10), notes: String(notes).slice(0, 4000) };
    const changed = old.title !== next.title || old.date !== next.date || old.notes !== next.notes;
    doc.items[eventId] = { ...next, updatedAt: changed || !old.updatedAt ? Date.now() : old.updatedAt };
  }
  await saveDoc(BRIEFS_UID, 'Event briefings', doc, prev);
  return doc.items[eventId] || null;
}
