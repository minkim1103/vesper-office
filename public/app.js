// Vesper — 프론트엔드 (빌드 도구 없이 바로 동작)
import { ASSISTANTS } from './assistant.js';
import { t as tr, locale, translate, observeTranslations } from './i18n.js';
const VERSION = '2.31';

/* ───────────── 도우미 ───────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const today = () => ymd(new Date());
const fmt = (s, opts) => new Intl.DateTimeFormat(locale(), opts).format(parse(s));
const longDate = (s) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = (s) => fmt(s, { weekday: 'short', month: 'short', day: 'numeric' });
const monthName = (y, m) => new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(y, m, 1));
const dday = (s) => { const n = diffDays(today(), s); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
const relLabel = (s) => { const n = diffDays(today(), s); return n === 0 ? tr('Today') : n === 1 ? tr('Tomorrow') : n === -1 ? tr('Yesterday') : ''; };
const ymKey = (y, m) => `${y}-${pad(m + 1)}`;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

/* ───────────── 화면 방향: 폰을 가로로 돌려도 세로 화면 유지 ─────────────
   가로가 되면 body 를 반대로 90° 돌려서 기기 기준 세로 모양을 유지합니다.
   그때는 #app 이 스크롤 영역이 되므로(패널·시트는 body 에 고정), 화면 크기·스크롤·터치 좌표는 아래 도우미로만 다룹니다. */
const view = { rot: null }; // null | 'l' | 'r'
const vw = () => (view.rot ? window.innerHeight : window.innerWidth);
const vh = () => (view.rot ? window.innerWidth : window.innerHeight);
const scroller = () => (view.rot ? document.getElementById('app') : (document.scrollingElement || document.documentElement));
const scrollTop = () => scroller().scrollTop;
/** 터치 좌표 → 앱 화면 기준 좌표 */
function pt(t) {
  if (view.rot === 'l') return { x: window.innerHeight - t.clientY, y: t.clientX };
  if (view.rot === 'r') return { x: t.clientY, y: window.innerWidth - t.clientX };
  return { x: t.clientX, y: t.clientY };
}
/** 요소의 스크롤 영역 안 세로 위치 (회전과 무관한 레이아웃 기준) */
function docTop(el) { let y = 0; for (let n = el; n && n !== document.body; n = n.offsetParent) y += n.offsetTop; return y; }
function applyRotation() {
  const landscapePhone = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (hover: none)').matches;
  let rot = null;
  if (landscapePhone) {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 90);
    rot = (a === 90) ? 'l' : 'r';
  }
  if (rot === view.rot) return;
  const keep = scrollTop();
  view.rot = rot;
  const html = document.documentElement;
  html.classList.toggle('rot', !!rot);
  html.classList.toggle('rot-l', rot === 'l');
  html.classList.toggle('rot-r', rot === 'r');
  html.style.setProperty('--panel-h', rot ? `${Math.max(250, Math.round(window.innerWidth * 0.38))}px` : '');
  requestAnimationFrame(() => { scroller().scrollTop = keep; if (typeof renderHeader === 'function' && !$('#app').hidden) { renderHeader(); updateMonthsOnScroll(); } });
}
applyRotation();
window.addEventListener('resize', applyRotation);
window.addEventListener('orientationchange', () => setTimeout(applyRotation, 50));
screen.orientation?.addEventListener?.('change', () => setTimeout(applyRotation, 50));

let AI = ASSISTANTS.claude;
function applyAssistant(id) {
  AI = ASSISTANTS[id] || ASSISTANTS.claude;
  const chosenTheme = store.get('theme', 'auto');
  const theme = ['claude', 'chatgpt'].includes(chosenTheme) ? chosenTheme : AI.id;
  document.documentElement.dataset.assistant = theme;
  const prefix = theme === 'chatgpt' ? 'chatgpt-' : '';
  $$('.login-mark').forEach(el => { el.src = `/icons/${prefix}logo.svg`; });
  $('link[rel="icon"]').href = `/icons/${prefix}logo.svg`;
  $('link[rel="apple-touch-icon"]').href = `/icons/${prefix}apple-touch-icon.png`;
  $('link[rel="manifest"]').href = `/api/manifest?assistant=${theme}`;
  $$('meta[name="theme-color"]').forEach(el => { el.content = theme === 'chatgpt' ? (el.media.includes('dark') ? '#182825' : '#F4F8F5') : (el.media.includes('dark') ? '#262624' : '#FAF9F5'); });
}
applyAssistant('claude');
fetch('/api/branding', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(ai => { if (ai) applyAssistant(ai.id); }).catch(() => {});
const STAR = '<svg class="star" viewBox="0 0 24 24"><path d="M12 2Q13.3 10.7 22 12Q13.3 13.3 12 22Q10.7 13.3 2 12Q10.7 10.7 12 2Z"/></svg>';
const ICON = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
};

/* ───────────── 상태 ───────────── */
const state = {
  view: 'month',
  selected: null,
  categories: [],
  hidden: new Set(store.get('hiddenCats', [])),
  cache: new Map(),
  agendaDays: 45,
  query: '',
  mode: 'icloud',
  google: 'off',
  months: [], // 화면에 그려진 달 [{y, m}]
  areas: [],
  tasks: [],
  spaceTab: 'all',
  spaceSub: null,
  showDone: false,
};

/* ───────────── API ───────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error(tr('Sign in required')); }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const inflight = new Map();
function fetchRange(from, to, { force = false } = {}) {
  const key = `${from}|${to}|${state.query}`;
  if (!force && state.cache.has(key)) return Promise.resolve(state.cache.get(key));
  if (!force && inflight.has(key)) return inflight.get(key);
  const q = state.query ? `&q=${encodeURIComponent(state.query)}` : '';
  const p = api(`/api/events?from=${from}&to=${to}${q}`)
    .then((data) => { state.cache.set(key, data); return data; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const visible = (list) => list.filter((e) => !state.hidden.has(e.calendarId));
const monthBounds = (y, m) => ({ from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });
const monthEvents = (y, m) => { const { from, to } = monthBounds(y, m); return state.cache.get(`${from}|${to}|`); };

/* ───────────── 토스트 ───────────── */
let toastTimer;
const translateMessage = msg => tr(msg);
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = translateMessage(msg); t.classList.toggle('error', isError); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ───────────── 로그인 ───────────── */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: { password: $('#pw').value } });
    $('#pw').value = '';
    start();
  } catch (err) { $('#loginErr').textContent = err.message; }
});

/* ───────────── 시작 ───────────── */
async function start() {
  try {
    const me = await api('/api/me');
    state.mode = me.mode; state.google = me.google || 'off'; state.tz = me.tz;
    applyAssistant(me.assistant?.id || 'claude');
  } catch { return; }
  $('#login').hidden = true; $('#app').hidden = false;
  $('#demoBadge').hidden = state.mode !== 'demo';
  await loadCategories();
  renderHeader();
  buildMonths();
  loadTasks();
  loadNote('daily').then(renderBell);
  loadBriefs();
  const taskId = new URLSearchParams(location.search).get('task');
  if (taskId) { history.replaceState(null, '', '/'); goPage(2).then(() => openTaskById(taskId)); }
  try { if (sessionStorage.getItem('openSettings')) { sessionStorage.removeItem('openSettings'); openAssistantSettings(); } } catch { /* optional navigation state */ }
}

async function loadCategories() {
  try { state.categories = await api('/api/categories'); } catch (e) { toast(e.message, true); }
}

function renderHeader(y, m) {
  $('#dow').innerHTML = [...(locale() === 'ko-KR' ? '일월화수목금토' : 'SMTWTFS')].map(day => `<span>${day}</span>`).join('');
  if (y === undefined) { const t = new Date(); y = t.getFullYear(); m = t.getMonth(); }
  $('#mName').textContent = monthName(y, m);
  $('#yNum').textContent = y;
  const tabs = $$('.views button');
  tabs.forEach((b) => b.setAttribute('aria-selected', b.dataset.view === state.view));
  const sel = tabs.find((b) => b.dataset.view === state.view);
  const nav = $('.views');
  nav.style.setProperty('--pill-w', `${sel.offsetWidth}px`);
  nav.style.setProperty('--pill-x', `${sel.offsetLeft - 3}px`);
  $('#monthView').hidden = state.view !== 'month';
  $('#listView').hidden = state.view !== 'list';
  $('#chrome').classList.toggle('list', state.view === 'list');
}
const chromeH = () => $('#chrome').offsetHeight;

/* ───────────── 월 보기: 세로 스크롤 ───────────── */
const eventsOn = (list, day) => list
  .filter((e) => e.startDate <= day && e.endDate >= day)
  .sort((a, b) => (b.allDay - a.allDay) || ((b.endDate > b.startDate) - (a.endDate > a.startDate)) || (a.startMs - b.startMs));

function monthHTML(y, m) {
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const t = today();
  const isCur = ymKey(y, m) === today().slice(0, 7);
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="day blank"></span>';
  for (let d = 1; d <= dim; d++) {
    const day = ymd(new Date(y, m, d));
    const dow = (first + d - 1) % 7;
    const cls = ['day'];
    if (dow === 0 || dow === 6) cls.push('wkend');
    if (day === t) cls.push('today');
    if (day === state.selected) cls.push('sel');
    cells += `<button class="${cls.join(' ')}" data-day="${day}"><span class="num">${d}</span></button>`;
  }
  return `<section class="mblock" data-ym="${ymKey(y, m)}">
    <h3 class="mlabel ${isCur ? 'cur' : ''}"><span style="grid-column:${first + 1}">${monthName(y, m)}${y !== new Date().getFullYear() ? ` ${y}` : ''}</span></h3>
    <div class="mgrid">${cells}</div></section>`;
}

/** 그날의 Vesper 항목: 마감(due)과 미리 알림(alarm) */
function taskItemsOn(day) {
  const items = [];
  for (const t of state.tasks) {
    // 캘린더에는 마감만 표시 (알림은 아이폰에서 그대로 울리고, 표시만 생략)
    if (t.due?.date === day) items.push({ kind: 'due', t, time: t.due.time });
  }
  return items.sort((a, b) => (a.kind === 'due' ? 0 : 1) - (b.kind === 'due' ? 0 : 1) || (a.time || '').localeCompare(b.time || ''));
}

const BELL_MINI = '<svg class="mini" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0"/></svg>';
function fillMonth(y, m) {
  const block = $(`.mblock[data-ym="${ymKey(y, m)}"]`);
  const list = monthEvents(y, m);
  if (!block || !list) return;
  const vis = visible(list);
  const maxBars = vw() >= 900 ? 4 : 3;
  for (const cell of $$('.day[data-day]', block)) {
    const day = cell.dataset.day;
    const evs = eventsOn(vis, day);
    const titems = taskItemsOn(day);
    const dow = parse(day).getDay();
    cell.classList.toggle('has-dl', evs.some((e) => e.deadline) || titems.some((i) => i.kind === 'due' && !i.t.done));
    const taskBars = titems.map((i) => (i.kind === 'due'
      ? `<span class="bar vtask ${i.t.done ? 'vdone' : ''}" style="--c:${i.t.areaColor}">${esc(i.t.title)}</span>`
      : `<span class="bar valarm" style="--c:${i.t.areaColor}">${BELL_MINI}${esc(i.t.title)}</span>`));
    const evBars = evs.map((e) => {
      const multi = e.endDate > e.startDate;
      const showTitle = e.startDate === day || dow === 0 || day.endsWith('-01');
      const c = [e.allDay || multi ? 'bar' : 'bar timed', e.deadline ? 'dl' : '', multi && !showTitle ? 'cont' : ''].join(' ');
      return `<span class="${c}" style="--c:${e.color}">${showTitle ? esc(e.title) : '&nbsp;'}</span>`;
    });
    const all = [...evBars, ...taskBars];
    const more = all.length > maxBars ? `<span class="more-n">+${all.length - maxBars}</span>` : '';
    cell.innerHTML = `<span class="num">${parse(day).getDate()}</span>${all.slice(0, maxBars).join('')}${more}`;
    cell.setAttribute('aria-label', `${longDate(day)}, ${all.length}${locale() === 'ko-KR' ? '개 항목' : ' items'}`);
  }
}

async function loadMonth(y, m, { force = false } = {}) {
  const { from, to } = monthBounds(y, m);
  try { await fetchRange(from, to, { force }); fillMonth(y, m); state.anchorFix?.(); } catch (e) { if (force) toast(e.message, true); }
}

function buildMonths() {
  const now = new Date();
  state.months = [];
  for (let i = -3; i <= 9; i++) { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); state.months.push({ y: d.getFullYear(), m: d.getMonth() }); }
  $('#months').innerHTML = state.months.map(({ y, m }) => monthHTML(y, m)).join('');
  scrollToMonth(now.getFullYear(), now.getMonth(), false);
  updateMonthsOnScroll();
  anchorToday();
}
/** 처음 열 때 이번 달에 고정: 글꼴·일정이 늦게 들어와 높이가 바뀌어도, 사용자가 직접 스크롤하기 전까지는 오늘 달로 다시 맞춤 */
let anchorOn = false, anchorEnd = 0;
function anchorToday() {
  anchorOn = true; anchorEnd = Date.now() + 6000;
  const fix = () => {
    if (!anchorOn || Date.now() > anchorEnd || state.view !== 'month' || state.page !== 0) return;
    const t = new Date(); scrollToMonth(t.getFullYear(), t.getMonth(), false);
  };
  [0, 120, 350, 800, 1500, 2500, 4000].forEach((ms) => setTimeout(fix, ms));
  document.fonts?.ready.then(fix);
  window.addEventListener('load', fix, { once: true });
  state.anchorFix = fix;
}
['touchstart', 'wheel', 'keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, () => { anchorOn = false; }, { passive: true, capture: true }));
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/** 지금 보이는 달: 제목 갱신 + 근처 달 일정 불러오기 */
function updateMonthsOnScroll() {
  if (state.view !== 'month' || $('#app').hidden) return;
  const st = scrollTop(), h = vh(), top = st + chromeH() + 10;
  let current = null;
  for (const b of $$('.mblock')) {
    const y0 = docTop(b), y1 = y0 + b.offsetHeight;
    if (y0 <= top) current = b;
    if (y1 > st - 800 && y0 < st + h + 800 && !b.dataset.loaded) {
      b.dataset.loaded = '1';
      const [y, m] = b.dataset.ym.split('-').map(Number);
      if (monthEvents(y, m - 1)) fillMonth(y, m - 1); else loadMonth(y, m - 1);
    }
  }
  if (current) { const [y, m] = current.dataset.ym.split('-').map(Number); renderHeader(y, m - 1); }
}

function scrollToMonth(y, m, smooth = true) {
  const b = $(`.mblock[data-ym="${ymKey(y, m)}"]`);
  if (!b) return;
  scroller().scrollTo({ top: docTop(b) - chromeH() + 2, behavior: smooth ? 'smooth' : 'auto' });
}

// 스크롤: 끝에 가까워지면 달을 더 붙이고, 보이는 달을 갱신
let extending = false, scrollRaf = 0;
document.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; onMonthsScroll(); });
}, { passive: true, capture: true });
function onMonthsScroll() {
  if (state.view !== 'month' || $('#app').hidden || state.page !== 0) return;
  updateMonthsOnScroll();
  if (extending) return;
  const sc = scroller(), st = sc.scrollTop;
  const nearBottom = vh() + st > sc.scrollHeight - 1200;
  const nearTop = st < 600;
  if (!nearBottom && !nearTop) return;
  extending = true;
  if (nearBottom) {
    const last = state.months[state.months.length - 1];
    const add = [];
    for (let i = 1; i <= 6; i++) { const d = new Date(last.y, last.m + i, 1); add.push({ y: d.getFullYear(), m: d.getMonth() }); }
    state.months.push(...add);
    $('#months').insertAdjacentHTML('beforeend', add.map(({ y, m }) => monthHTML(y, m)).join(''));
  } else {
    const first = state.months[0];
    const add = [];
    for (let i = 6; i >= 1; i--) { const d = new Date(first.y, first.m - i, 1); add.push({ y: d.getFullYear(), m: d.getMonth() }); }
    const before = sc.scrollHeight;
    state.months.unshift(...add);
    $('#months').insertAdjacentHTML('afterbegin', add.map(({ y, m }) => monthHTML(y, m)).join(''));
    sc.scrollTop += sc.scrollHeight - before; // 보던 위치 유지
  }
  extending = false;
  updateMonthsOnScroll();
}

$('#months').addEventListener('click', (e) => {
  const c = e.target.closest('.day[data-day]');
  if (c) selectDay(c.dataset.day);
});

/* ───────────── 하루 일정 패널 ───────────── */
function selectDay(day) {
  if (state.selected === day && !$('#dayPanel').hidden) { closeDayPanel(); return; } // 같은 날 다시 누르면 닫기
  state.selected = day;
  $$('.day.sel').forEach((c) => c.classList.remove('sel'));
  const cell = $(`.day[data-day="${day}"]`);
  cell?.classList.add('sel');
  openDayPanel();
  renderDayPanel();
  // 선택한 날이 패널에 가리지 않게 스크롤
  if (cell) {
    const panelTop = vh() - $('#dayPanel').offsetHeight;
    const top = docTop(cell) - scrollTop(), bottom = top + cell.offsetHeight;
    if (bottom > panelTop - 8) scroller().scrollBy({ top: bottom - panelTop + 24, behavior: 'smooth' });
    else if (top < chromeH()) scroller().scrollBy({ top: top - chromeH() - 24, behavior: 'smooth' });
  }
}

function openDayPanel() {
  const p = $('#dayPanel');
  if (!p.hidden && !p.classList.contains('closing')) return;
  p.classList.remove('closing'); p.hidden = false; p.style.transform = '';
  document.documentElement.style.setProperty('--panel-pad', `calc(var(--panel-h) - 60px)`);
  document.documentElement.style.setProperty('--fab-lift', `calc(var(--panel-h) - 10px)`);
}
/** 하루 패널 높이: 일정 3개까지는 잘리지 않게, 그 이상은 3개 + 살짝 보이게 */
function fitDayPanel() {
  const p = $('#dayPanel'); if (p.hidden || view.rot) return;
  const lis = $$('#dayList > li');
  const head = $('.day-head', p);
  const cs = getComputedStyle(p);
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  const n = Math.min(3, Math.max(1, lis.length - 1)); // 마지막 li 는 "Add event"
  let h = padT + padB + (head ? head.offsetHeight + 12 : 0);
  for (let i = 0; i < n; i++) h += lis[i].offsetHeight + 8;
  if (lis.length - 1 > 3) h += 34; // 더 있다는 걸 살짝
  else h += (lis[lis.length - 1]?.offsetHeight || 48) + 4;
  const px = Math.round(Math.max(250, Math.min(h, vh() * 0.62)));
  document.documentElement.style.setProperty('--panel-h', `${px}px`);
}
async function loadBriefs() {
  try { state.briefs = await api('/api/briefs'); } catch { state.briefs = state.briefs || {}; }
  // 브리핑 노트를 미리 받아 둬서 상세 창이 열릴 때 내용이 한 번에 뜨게
  await prefetchNotes(Object.values(state.briefs || {}).map((b) => b.key));
}
/** 노트를 한 번에 미리 받아 두기 — 시트가 열릴 때 Claude 카드가 처음부터 같이 그려지도록 */
async function prefetchNotes(keys) {
  keys = keys.filter(Boolean); if (!keys.length) return;
  try {
    const { notes } = await api('/api/notes', { method: 'POST', body: { keys } });
    for (const [k, n] of Object.entries(notes || {})) {
      const prev = state.notes[k]; state.notes[k] = n;
      if (n && prev && prev.updatedAt !== n.updatedAt) onNoteChanged(k);
    }
  } catch { await Promise.all(keys.map((k) => loadNote(k))); }
}
const researchNoteKeys = () => [...state.topics.map((t) => t.id), ...state.tasks.filter((t) => t.uid && t.topicId).map((t) => `task-${t.uid}`)];
/** Claude 미리보기 카드 내부 */
const noteCardInner = (n, lines) => `<span class="cb-head">${STAR}<b>${esc(AI.name)}</b><span>${noteTime(n)}</span></span><span class="cb-text">${esc(notePreview(n.text, lines))}</span>`;
/** 일정 상세 창의 Claude 브리핑 카드 */
function briefCard(b) {
  const n = state.notes[b.key];
  if (n === undefined) return `<div class="tp-note ev-brief loading" data-k="${b.key}"><span class="cb-head">${STAR}<b>${esc(AI.name)}</b></span><span class="cb-text">&nbsp;<br>&nbsp;</span></div>`;
  if (!n) return `<div class="ev-brief pending">${STAR}${tr('Briefing pending')}</div>`;
  return `<button class="tp-note ev-brief" data-k="${b.key}"><span class="cb-head">${STAR}<b>${esc(AI.name)}</b><span>${noteTime(n)}</span></span><span class="cb-text">${esc(notePreview(n.text, 4))}</span></button>`;
}
function closeDayPanel() {
  const p = $('#dayPanel');
  if (p.hidden) return;
  p.classList.add('closing');
  document.documentElement.style.setProperty('--fab-lift', '0px');
  setTimeout(() => {
    p.hidden = true; p.classList.remove('closing'); p.style.transform = '';
    document.documentElement.style.setProperty('--panel-pad', '0px');
  }, 220);
  $$('.day.sel').forEach((c) => c.classList.remove('sel'));
  state.selected = null;
}
document.addEventListener('click', (e) => {
  if ($('#dayPanel').hidden) return;
  if (e.target.closest('#dayPanel, #sheet, #scrim, #spaces, #workstream, .fab, #chrome, .day[data-day]')) return;
  closeDayPanel();
});
/* 아래에서 올라온 패널: 내용이 맨 위인 상태에서 더 끌어내리면 패널이 손가락을 따라 내려가고, 충분히 내리면 닫힘 */
function pullToClose(el, getScroller, onClose, threshold) {
  let lastY = null, baseY = 0, dy = 0, drag = false, t0 = 0;
  const reset = () => { el.style.transition = 'transform .25s cubic-bezier(.22,.8,.24,1)'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 260); };
  el.addEventListener('touchstart', (e) => { if (e.touches.length > 1) { lastY = null; return; } lastY = pt(e.touches[0]).y; drag = false; dy = 0; }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (lastY === null || e.touches.length > 1) return;
    const y = pt(e.touches[0]).y;
    if (!drag) {
      const sc = getScroller();
      // 아래로 끄는 중이고, 스크롤이 이미 맨 위면 → 이 지점부터 패널 끌기 시작
      if (y > lastY + 1 && (!sc || sc.scrollTop <= 0) && !e.target.closest('input, textarea, select')) {
        drag = true; baseY = y; t0 = performance.now(); el.style.transition = 'none';
      } else { lastY = y; return; }
    }
    dy = Math.max(0, y - baseY);
    if (e.cancelable) e.preventDefault(); // 안쪽 스크롤 고무줄 효과 대신 패널이 내려감
    el.style.transform = `translateY(${dy}px)`;
    lastY = y;
  }, { passive: false });
  const end = () => {
    lastY = null;
    if (!drag) return;
    drag = false;
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > threshold || (dy > 40 && v > 0.5)) { el.style.transition = ''; onClose(); } // 현재 위치에서 닫힘 애니메이션 이어짐
    else reset();
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}
pullToClose($('#dayPanel'), () => $('#dayList'), closeDayPanel, 80);

function renderDayPanel() {
  const day = state.selected;
  if (!day) return;
  const d = parse(day);
  const list = monthEvents(d.getFullYear(), d.getMonth());
  const evs = list ? eventsOn(visible(list), day) : [];
  const titems = taskItemsOn(day);
  const rel = relLabel(day);
  $('#dayTitle').innerHTML = `${longDate(day)}${rel ? ` <small>${rel}</small>` : ''}`;
  const ul = $('#dayList');
  ul.innerHTML = evs.map((e, i) => `<li>${evRow(e, day, i)}</li>`).join('')
    + titems.map((it, i) => `<li>${taskEvRow(it, i)}</li>`).join('')
    + `<li><button class="add-inline" id="dayAdd">${ICON.plus}${tr('Add event')}</button></li>`;
  $$('.ev[data-i]', ul).forEach((b) => b.addEventListener('click', () => openDetail(evs[+b.dataset.i])));
  $$('.ev[data-t]', ul).forEach((b) => b.addEventListener('click', () => openTask(titems[+b.dataset.t].t)));
  $('#dayAdd').addEventListener('click', () => openEditor(null, { date: day }));
  ul.classList.remove('swap'); void ul.offsetWidth; ul.classList.add('swap');
  requestAnimationFrame(fitDayPanel);
  if (!list) loadMonth(d.getFullYear(), d.getMonth()).then(() => { if (state.selected === day) renderDayPanel(); });
}

function taskEvRow({ kind, t, time }, i) {
  const due = kind === 'due';
  const meta = [`<span>${esc(t.area)}${t.tag ? ` · ${esc(t.tag)}` : ''}</span>`];
  if (due && !t.done && t.due) meta.unshift(`<span class="dday">${t.overdue ? tr('Overdue') : t.dday === 0 ? 'D-day' : `D-${t.dday}`}</span>`);
  if (!due && t.due) meta.unshift(`<span>${tr('Due')} ${fmt(t.due.date, { month: 'short', day: 'numeric' })}${t.due.time ? ' ' + t.due.time : ''}</span>`);
  return `<button class="ev vt ${due ? '' : 'alarm'} ${t.done ? 'vdone' : ''}" data-t="${i}" style="--c:${t.areaColor}">
    <span class="stripe"></span>
    <span class="when">${due ? (time || 'Due') : time}<small>${due ? (time ? 'Due' : '') : 'Reminder'}</small></span>
    <span class="what"><span class="title">${due ? '' : ICON.bell}${esc(t.title)}</span>
    <span class="meta">${meta.join('')}</span></span>
  </button>`;
}

function evRow(e, day, i) {
  let when, sub = '';
  if (e.allDay) {
    when = tr('All day');
    if (e.endDate > e.startDate) sub = `Day ${diffDays(e.startDate, day) + 1}/${diffDays(e.startDate, e.endDate) + 1}`;
  } else {
    when = e.startDate === day ? e.startTime : '…';
    sub = e.endDate === day ? e.endTime : 'next day';
  }
  const meta = [];
  if (e.deadline && e.startDate >= today()) meta.push(`<span class="dday">${dday(e.startDate)}</span>`);
  meta.push(`<span>${esc(e.calendar)}</span>`);
  if (e.recurring) meta.push(`<span>${ICON.repeat}</span>`);
  if (state.briefs?.[e.id]) meta.push(`<span class="brief-tag">${STAR}Briefing</span>`);
  return `<button class="ev" data-i="${i}" style="--c:${e.color}">
    <span class="stripe"></span>
    <span class="when">${when}${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="what"><span class="title">${e.deadline ? STAR : ''}${esc(e.title)}</span>
    <span class="meta">${meta.join('')}</span></span>
  </button>`;
}

/* ───────────── 목록 보기 ───────────── */
async function renderDeadlines() {
  const box = $('#deadlines');
  try {
    const t = today();
    const list = visible(await fetchRange(t, addDays(t, 30))).filter((e) => e.deadline && e.startDate >= t);
    const seen = new Set();
    const items = list.filter((e) => !seen.has(e.id + e.startDate) && seen.add(e.id + e.startDate)).slice(0, 12);
    box.innerHTML = items.map((e, i) => `<button class="dl-card" data-i="${i}">
        <span class="dd ${diffDays(t, e.startDate) <= 3 ? 'hot' : ''}">${dday(e.startDate)}</span>
        <span class="t">${esc(e.title)}</span>
        <span class="d"><i class="dot" style="--c:${e.color}"></i>${shortDate(e.startDate)}${e.startTime ? ' · ' + e.startTime : ''}</span>
      </button>`).join('');
    $$('.dl-card', box).forEach((b) => b.addEventListener('click', () => openDetail(items[+b.dataset.i])));
  } catch { box.innerHTML = ''; }
}

async function renderAgenda() {
  renderDeadlines();
  const box = $('#agenda');
  const t = today();
  const from = state.query ? addDays(t, -60) : t;
  const to = state.query ? addDays(t, 365) : addDays(t, state.agendaDays);
  let list = [];
  try { list = visible(await fetchRange(from, to)); } catch (e) { toast(e.message, true); }
  const days = new Map();
  for (const e of list) {
    const s = e.startDate < from ? from : e.startDate;
    if (!days.has(s)) days.set(s, []);
    days.get(s).push(e);
  }
  const keys = [...days.keys()].sort();
  if (!keys.length) box.innerHTML = '<p class="empty-note" data-i18n="No events">No events</p>';
  else {
    box.innerHTML = keys.map((k) => {
      const n = diffDays(t, k);
      const rel = relLabel(k) || (n > 1 && n < 7 ? locale() === 'ko-KR' ? `${n}일 후` : `In ${n} days` : '');
      return `<section class="ag-day ${n === 0 ? 'is-today' : ''}"><h3>${shortDate(k)}${rel ? `<small>${rel}</small>` : ''}</h3>
        <ul class="ev-list">${days.get(k).map((e) => `<li>${evRow(e, k, list.indexOf(e))}</li>`).join('')}</ul></section>`;
    }).join('');
    $$('.ev', box).forEach((b) => b.addEventListener('click', () => openDetail(list[+b.dataset.i])));
  }
  $('#moreBtn').hidden = !!state.query || !keys.length;
}

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value.trim(); renderAgenda(); }, 300);
});
$('#moreBtn').addEventListener('click', () => { state.agendaDays += 60; renderAgenda(); });

/* ───────────── 바텀 시트 ───────────── */
let closing = null;
/* 시트 위에 시트: 주제 → 할 일처럼 이어서 열면 아래 시트는 그대로 두고 새 시트가 위로 올라옴.
   위 시트를 내리면 아래 시트가 다시 살아남. */
const sheetStack = [];
let pushNext = null, tasksVer = 0;
/** 다음 openSheet 를 '위에 쌓기'로. reopen = 아래 시트 내용이 바뀌었을 때(할 일 완료 등) 다시 그리는 함수 */
function stackSheet(reopen) { if (!$('#sheet').hidden && !closing) pushNext = reopen; }
function openSheet(html) {
  if (pushNext) {
    // 아래 시트의 실제 DOM(이벤트 포함)을 그대로 뒤쪽 레이어로 옮겨 둠 → 다시 그리지 않으니 가벼움
    const reopen = pushNext; pushNext = null;
    const sh = $('#sheet'), body = $('#sheetBody');
    const ghost = document.createElement('section');
    ghost.className = 'sheet sheet-ghost'; ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = '<div class="grabber" aria-hidden="true"></div>';
    const keep = document.createElement('div');
    while (body.firstChild) keep.appendChild(body.firstChild);
    ghost.appendChild(keep);
    sh.after(ghost); // DOM 상 뒤(검색은 위 시트가 먼저), 화면상 아래(z-index)
    ghost.scrollTop = sh.scrollTop;
    sheetStack.push({ reopen, ghost, keep, scroll: sh.scrollTop, ver: tasksVer });
    body.innerHTML = html;
    translate(body);
    sh.style.transform = ''; sh.scrollTop = 0; sh.style.animation = '';
    sh.classList.remove('pushin'); void sh.offsetWidth; sh.classList.add('pushin');
    return;
  }
  if (closing) { clearTimeout(closing); closing = null; $('#sheet').classList.remove('closing'); $('#scrim').classList.remove('closing'); }
  $('#sheetBody').innerHTML = html;
  translate($('#sheetBody'));
  $('#sheet').style.transform = '';
  const wasOpen = !$('#sheet').hidden;
  if (!wasOpen) $('#sheet').style.animation = '';
  $('#scrim').hidden = false; $('#sheet').hidden = false;
  if (!wasOpen) $('#sheet').scrollTop = 0;
}
function closeSheet() {
  if ($('#sheet').hidden || closing) return;
  $('#sheet').style.animation = ''; // 닫힘 애니메이션은 클래스로
  if (sheetStack.length) {
    // 위 시트만 내리고, 끝나면 아래 시트의 DOM 을 그대로 되돌림 (다시 그리지 않음)
    const top = sheetStack.pop(), sh = $('#sheet'), body = $('#sheetBody');
    sh.classList.remove('pushin'); sh.classList.add('closing'); // pushin 이 남아 있으면 내려가는 애니메이션이 안 먹음
    closing = setTimeout(() => {
      closing = null;
      sh.style.animation = 'none'; sh.classList.remove('closing', 'pushin'); sh.style.transform = '';
      body.replaceChildren(...top.keep.childNodes);
      sh.scrollTop = top.scroll;
      top.ghost.remove();
      if (top.ver !== tasksVer) requestAnimationFrame(() => { top.reopen(); sh.scrollTop = top.scroll; }); // 그사이 데이터가 바뀌었으면 갱신
    }, 245);
    return;
  }
  $('#sheet').classList.remove('pushin'); $('#sheet').classList.add('closing'); $('#scrim').classList.add('closing');
  closing = setTimeout(() => {
    $('#scrim').hidden = true; $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; $('#sheet').style.transform = '';
    $$('.sheet-ghost').forEach((g) => g.remove()); sheetStack.length = 0;
    $('#sheet').classList.remove('closing'); $('#scrim').classList.remove('closing'); closing = null;
  }, 220);
}
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#sheet').hidden) closeSheet();
  else if (state.page > 0) goPage(state.page - 1);
  else if (state.page < 0) goPage(0);
  else closeDayPanel();
});
pullToClose($('#sheet'), () => $('#sheet'), closeSheet, 110);

/* ───────────── 일정 상세 / 편집 ───────────── */
const DOWEN = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
function recurrenceLabel(r) {
  if (!r) return tr('Repeats');
  const n = r.interval > 1 ? r.interval : 0;
  if (locale() === 'ko-KR') {
    const units = { DAILY: '일', WEEKLY: '주', MONTHLY: '개월', YEARLY: '년' };
    let label = n ? `${n}${units[r.freq] || ''}마다` : { DAILY: '매일', WEEKLY: '매주', MONTHLY: '매월', YEARLY: '매년' }[r.freq] || '반복';
    if (r.byday?.length) label += ' · ' + r.byday.map(day => {
      const match = /^(-?\d+)?([A-Z]{2})$/.exec(day);
      if (!match) return day;
      const ordinal = match[1] ? (+match[1] === -1 ? '마지막 ' : `${match[1]}번째 `) : '';
      return ordinal + { SU: '일', MO: '월', TU: '화', WE: '수', TH: '목', FR: '금', SA: '토' }[match[2]];
    }).join(', ');
    if (r.count) label += ` · ${r.count}회`;
    if (r.until) label += ` · ${shortDate(r.until)}까지`;
    return label;
  }
  let s = { DAILY: n ? `Every ${n} days` : 'Daily', WEEKLY: n ? `Every ${n} weeks` : 'Weekly', MONTHLY: n ? `Every ${n} months` : 'Monthly', YEARLY: n ? `Every ${n} years` : 'Yearly' }[r.freq] || tr('Repeats');
  if (r.byday?.length) {
    s += ' on ' + r.byday.map((d) => {
      const m = /^(-?\d+)?([A-Z]{2})$/.exec(d);
      if (!m) return d;
      const ord = m[1] ? (+m[1] === -1 ? 'last ' : `${['', '1st', '2nd', '3rd', '4th', '5th'][+m[1]] || m[1]} `) : '';
      return ord + DOWEN[m[2]];
    }).join(', ');
  }
  if (r.count) s += `, ${r.count} times`;
  if (r.until) s += `, until ${shortDate(r.until)}`;
  return s;
}

function openDetail(e) {
  const when = e.allDay
    ? (e.endDate > e.startDate ? `${shortDate(e.startDate)} – ${shortDate(e.endDate)}` : `${longDate(e.startDate)} · ${tr('All day')}`)
    : (e.endDate > e.startDate ? `${shortDate(e.startDate)} ${e.startTime} – ${shortDate(e.endDate)} ${e.endTime}` : `${longDate(e.startDate)} · ${e.startTime} – ${e.endTime}`);
  const rows = [
    `<div>${ICON.clock}<span>${when}${e.deadline && e.startDate >= today() ? ` · <span class="dday">${dday(e.startDate)}</span>` : ''}</span></div>`,
    `<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="${e.color}" stroke="none"/></svg><span>${esc(e.calendar)}</span></div>`,
  ];
  if (e.recurring) rows.push(`<div>${ICON.repeat}<span>${recurrenceLabel(e.recurrence)}</span></div>`);
  if (e.location) rows.push(`<div>${ICON.pin}<span>${esc(e.location)}</span></div>`);
  if (e.notes) rows.push(`<div>${ICON.note}<span class="notes">${esc(e.notes)}</span></div>`);
  openSheet(`
    <div class="sheet-head"><span></span><button class="link" data-close data-i18n="Close">Close</button></div>
    <h2 class="detail-title">${e.deadline ? STAR : ''}${esc(e.title)}</h2>
    <div class="detail-rows">${rows.join('')}</div>
    ${state.briefs?.[e.id] ? `<div class="brief-slot">${briefCard(state.briefs[e.id])}</div>` : ''}
    ${e.readOnly ? '' : `<div class="actions">
      <button class="btn danger" id="delBtn" data-i18n="Delete">Delete</button>
      <button class="btn primary" id="editBtn" data-i18n="Edit">Edit</button>
    </div>`}`);
  $('[data-close]').addEventListener('click', closeSheet);
  const b = state.briefs?.[e.id];
  if (b) {
    const wire = () => $('.brief-slot button.ev-brief')?.addEventListener('click', () => { stackSheet(() => openDetail(e)); openNote(b.key); });
    wire();
    if (state.notes[b.key] === undefined) loadNote(b.key).then(() => { const sl = $('.brief-slot'); if (sl) { sl.innerHTML = briefCard(b); wire(); } });
  }
  if (e.readOnly) return;
  $('#editBtn').addEventListener('click', () => openEditor(e));
  $('#delBtn').addEventListener('click', () => confirmDelete(e));
}

function confirmDelete(e) {
  openSheet(`
    <div class="sheet-head"><h2 data-i18n="Delete event">Delete event</h2><button class="link" data-close data-i18n="Cancel">Cancel</button></div>
    <div class="stack-actions">
      ${e.recurring
        ? `<button class="btn ghost" id="delOne" data-i18n="This event only">This event only</button><button class="btn danger" id="delAll" data-i18n="All events">All events</button>`
        : `<button class="btn danger" id="delAll" data-i18n="Delete">Delete</button>`}
    </div>`);
  $('[data-close]').addEventListener('click', closeSheet);
  $('#delOne')?.addEventListener('click', () => doDelete(e, e.occurrence));
  $('#delAll').addEventListener('click', () => doDelete(e));
}

async function doDelete(e, occurrence) {
  try {
    await api(`/api/events/${encodeURIComponent(e.id)}${occurrence ? `?occurrence=${encodeURIComponent(occurrence)}` : ''}`, { method: 'DELETE' });
    closeSheet(); toast(tr('Deleted')); refresh();
  } catch (err) { toast(err.message, true); }
}

async function openEditor(ev, { date } = {}) {
  let base = ev;
  if (ev?.recurring) {
    try { base = await api(`/api/events/${encodeURIComponent(ev.id)}`); } catch (err) { toast(err.message, true); return; }
  }
  const isNew = !base;
  const writable = state.categories.filter((c) => !c.readOnly);
  const lastCat = store.get('lastCat', null);
  const d = date || state.selected || today();
  const f = isNew ? {
    title: '', calendarId: (writable.find((c) => c.id === lastCat) || writable.find((c) => !state.hidden.has(c.id)) || writable[0])?.id,
    allDay: false, startDate: d, startTime: nextHour(), endDate: d, endTime: '', deadline: false, recurrence: null, notes: '', brief: false,
  } : {
    title: base.title, calendarId: base.calendarId, allDay: base.allDay, startDate: base.startDate, startTime: base.startTime || '09:00',
    endDate: base.endDate, endTime: base.endTime || '10:00', deadline: base.deadline, recurrence: base.recurrence,
    notes: base.notes || '', brief: !!state.briefs?.[base.id],
  };
  if (isNew) { const [h, m] = f.startTime.split(':').map(Number); f.endTime = `${pad((h + 1) % 24)}:${pad(m)}`; if (h === 23) f.endDate = addDays(d, 1); }
  const original = JSON.parse(JSON.stringify(f));
  const recKey = (r) => {
    if (!r) return 'NONE';
    const simple = !r.count && !r.until && (!r.byday || r.byday.length <= 1);
    if (!simple) return 'CUSTOM';
    if (r.freq === 'WEEKLY' && r.interval === 2) return 'BIWEEKLY';
    return r.interval > 1 ? 'CUSTOM' : r.freq;
  };
  const rk = recKey(f.recurrence);

  openSheet(`
    <div class="sheet-head"><h2>${isNew ? tr('New event') : tr('Edit event')}</h2><button class="link" data-close data-i18n="Cancel">Cancel</button></div>
    <form class="form" id="evForm" novalidate>
      <input class="title-input" name="title" placeholder="Title" data-i18n-placeholder="Title" value="${esc(f.title)}" autocomplete="off" required>
      <div class="chips" id="catChips">${writable.map((c) => `<button type="button" class="chip" data-id="${c.id}" style="--c:${c.color}" aria-pressed="${c.id === f.calendarId}"><i class="dot"></i>${esc(c.name)}</button>`).join('')}</div>
      <div class="group">
        <div class="row"><span class="lbl">${STAR}${tr('Important')}</span><label class="sw"><input type="checkbox" name="deadline" ${f.deadline ? 'checked' : ''} aria-label="Important" data-i18n-aria-label="Important"><span></span></label></div>
        <div class="row"><span class="lbl">${STAR}${esc(AI.name)} ${tr('Briefing')}</span><label class="sw"><input type="checkbox" name="brief" ${f.brief ? 'checked' : ''} aria-label="AI briefing" data-i18n-aria-label="AI briefing"><span></span></label></div>
      </div>
      <textarea class="notes-in brief-notes" name="notes" placeholder="${locale() === 'ko-KR' ? '메모' : 'Notes'}" ${f.brief || f.notes ? '' : 'hidden'}>${esc(f.notes)}</textarea>
      <div class="group">
        <div class="row"><span class="lbl" data-i18n="All day">All day</span><label class="sw"><input type="checkbox" name="allDay" ${f.allDay ? 'checked' : ''} aria-label="All day" data-i18n-aria-label="All day"><span></span></label></div>
        <div class="row"><span class="lbl" data-i18n="Starts">Starts</span><div class="inputs"><input type="date" name="startDate" value="${f.startDate}" required><input class="time-in" type="time" name="startTime" value="${f.startTime}" ${f.allDay ? 'hidden' : ''}></div></div>
        <div class="row"><span class="lbl" data-i18n="Ends">Ends</span><div class="inputs"><input type="date" name="endDate" value="${f.endDate}"><input class="time-in" type="time" name="endTime" value="${f.endTime}" ${f.allDay ? 'hidden' : ''}></div></div>
        <div class="row"><span class="lbl" data-i18n="Repeat">Repeat</span><select name="rec">
          <option value="NONE" data-i18n="Never">Never</option><option value="DAILY" data-i18n="Daily">Daily</option><option value="WEEKLY" data-i18n="Weekly">Weekly</option>
          <option value="BIWEEKLY" data-i18n="Every 2 weeks">Every 2 weeks</option><option value="MONTHLY" data-i18n="Monthly">Monthly</option><option value="YEARLY" data-i18n="Yearly">Yearly</option>
          ${rk === 'CUSTOM' ? `<option value="CUSTOM">${esc(recurrenceLabel(f.recurrence))}</option>` : ''}
        </select></div>
      </div>
      <button class="btn primary" type="submit">${isNew ? tr('Add') : tr('Save')}</button>
    </form>`);
  const form = $('#evForm');
  form.rec.value = rk;
  $('[data-close]').addEventListener('click', closeSheet);
  if (isNew) setTimeout(() => form.title.focus(), 300);
  $('#catChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    f.calendarId = b.dataset.id;
    $$('.chip', $('#catChips')).forEach((c) => c.setAttribute('aria-pressed', c === b));
  });
  form.allDay.addEventListener('change', () => { form.startTime.hidden = form.endTime.hidden = form.allDay.checked; });
  form.brief.addEventListener('change', () => { if (form.brief.checked) { form.notes.hidden = false; setTimeout(() => form.notes.focus(), 50); } else if (!form.notes.value.trim()) form.notes.hidden = true; });
  form.startDate.addEventListener('change', () => { form.endDate.value = addDays(form.startDate.value, Math.max(0, diffDays(original.startDate, original.endDate))); });
  form.startTime.addEventListener('change', () => {
    const [sh, sm] = original.startTime.split(':').map(Number);
    const [eh, em] = original.endTime.split(':').map(Number);
    let dur = (eh * 60 + em) - (sh * 60 + sm); if (dur <= 0) dur = 60;
    const [h, m] = form.startTime.value.split(':').map(Number);
    const end = h * 60 + m + dur;
    form.endTime.value = `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    const cur = {
      title, calendarId: f.calendarId, allDay: form.allDay.checked,
      startDate: form.startDate.value, startTime: form.startTime.value, endDate: form.endDate.value || form.startDate.value, endTime: form.endTime.value,
      deadline: form.deadline.checked, notes: form.notes.value.trim(),
    };
    if (cur.endDate < cur.startDate) cur.endDate = cur.startDate;
    if (!cur.allDay && cur.endDate === cur.startDate && cur.endTime && cur.endTime <= cur.startTime) cur.endDate = addDays(cur.startDate, 1);
    const recSel = form.rec.value;
    const recurrence = recSel === 'NONE' ? { freq: 'NONE' } : recSel === 'BIWEEKLY' ? { freq: 'WEEKLY', interval: 2 } : recSel === 'CUSTOM' ? undefined : { freq: recSel };
    let body;
    if (isNew) {
      body = { ...cur };
      if (!body.notes) delete body.notes;
      if (recurrence && recurrence.freq !== 'NONE') body.recurrence = recurrence;
      if (cur.allDay) { delete body.startTime; delete body.endTime; }
    } else {
      body = {};
      for (const k of ['title', 'deadline', 'calendarId', 'notes']) if (cur[k] !== original[k]) body[k] = cur[k];
      const timingChanged = cur.allDay !== original.allDay || cur.startDate !== original.startDate || cur.endDate !== original.endDate
        || (!cur.allDay && (cur.startTime !== original.startTime || cur.endTime !== original.endTime));
      if (timingChanged) for (const k of ['allDay', 'startDate', 'startTime', 'endDate', 'endTime']) body[k] = cur[k];
      if (recSel !== rk) body.recurrence = recurrence;
      if (!Object.keys(body).length && form.brief.checked === original.brief) { closeSheet(); return; }
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      let saved = null;
      if (isNew) saved = await api('/api/events', { method: 'POST', body });
      else if (Object.keys(body).length) saved = await api(`/api/events/${encodeURIComponent(base.id)}`, { method: 'PATCH', body });
      const evId = saved?.id || base?.id;
      // Claude 브리핑 켜기/끄기 (일정 id 가 바뀌었으면 옛 등록은 지움)
      if (evId && (form.brief.checked || original.brief)) {
        if (base?.id && base.id !== evId && original.brief) await api('/api/briefs', { method: 'POST', body: { eventId: base.id, on: false } }).catch(() => {});
        await api('/api/briefs', { method: 'POST', body: { eventId: evId, on: form.brief.checked, title: cur.title, date: cur.startDate, notes: cur.notes } });
        await loadBriefs();
      }
      store.set('lastCat', cur.calendarId);
      closeSheet();
      toast(isNew ? tr('Added') : tr('Saved'));
      refresh();
    } catch (err) { btn.disabled = false; toast(err.message, true); }
  });
}
function nextHour() { const d = new Date(); return `${pad((d.getHours() + 1) % 24)}:00`; }

/* ───────────── 캘린더 목록 ───────────── */
const PALETTE = ['#D97757', '#E3A13B', '#7CA25A', '#4C9A8F', '#6A9BCC', '#8F7BC8', '#C46A9A', '#8F8D85'];
function openCategories() {
  let color = PALETTE[0];
  const render = () => {
    const item = (c) => `
        <li class="cat-item" style="--c:${c.color}"><i class="dot"></i><span class="name">${esc(c.name)}</span>
          <label class="sw"><input type="checkbox" data-id="${c.id}" ${state.hidden.has(c.id) ? '' : 'checked'} aria-label="${esc(c.name)} ${tr('Show')}"><span></span></label></li>`;
    const icl = state.categories.filter((c) => c.provider !== 'google');
    const ggl = state.categories.filter((c) => c.provider === 'google');
    let googleBlock = '';
    if (state.google === 'connected') googleBlock = `<h3 class="sub-head" data-i18n="Google">Google</h3><ul class="cat-list group">${ggl.map(item).join('')}</ul>`;
    else if (state.google === 'ready') googleBlock = `<h3 class="sub-head" data-i18n="Google">Google</h3><a class="btn ghost connect-g" href="/api/google/connect" data-i18n="Connect Google Calendar">Connect Google Calendar</a>`;
    openSheet(`
      <div class="sheet-head"><h2 data-i18n="Calendars">Calendars</h2><button class="link" data-close data-i18n="Done">Done</button></div>
      <button class="btn ghost connect-g settings-entry" id="aiSettings" data-i18n="Settings">Settings</button>
      ${state.google !== 'off' ? '<h3 class="sub-head" data-i18n="iCloud">iCloud</h3>' : ''}
      <ul class="cat-list group">${icl.map(item).join('')}</ul>
      ${googleBlock}
      <h3 class="sub-head" data-i18n="New calendar">New calendar</h3>
      <form id="catForm" class="form">
        <div class="swatches">${PALETTE.map((p) => `<button type="button" class="swatch" data-c="${p}" style="--c:${p}" aria-label="Color ${p}" aria-pressed="${p === color}"></button>`).join('')}</div>
        <div class="new-cat"><input name="name" placeholder="Name" data-i18n-placeholder="Name" autocomplete="off"><button class="btn primary" type="submit" data-i18n="Add">Add</button></div>
      </form>
      <p class="app-version">Vesper v${VERSION}</p>`);
    $('[data-close]').addEventListener('click', () => { closeSheet(); repaintMonths(); if (state.view === 'list') renderAgenda(); });
    $('#aiSettings').addEventListener('click', openAssistantSettings);
    $$('.cat-item input').forEach((i) => i.addEventListener('change', () => {
      if (i.checked) state.hidden.delete(i.dataset.id); else state.hidden.add(i.dataset.id);
      store.set('hiddenCats', [...state.hidden]);
    }));
    $$('.swatch').forEach((s) => s.addEventListener('click', () => {
      color = s.dataset.c;
      $$('.swatch').forEach((x) => x.setAttribute('aria-pressed', x === s));
    }));
    $('#catForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      try {
        await api('/api/categories', { method: 'POST', body: { name, color } });
        await loadCategories(); toast(tr('Added')); render();
      } catch (err) { toast(err.message, true); }
    });
  };
  render();
}

/* ───────────── 새로고침 ───────────── */
function repaintMonths() {
  for (const { y, m } of state.months) if (monthEvents(y, m)) fillMonth(y, m);
  renderDayPanel();
}
let refreshing = false;
async function refresh({ silent = true } = {}) {
  if (refreshing) return;
  refreshing = true;
  $('#refreshBtn').classList.add('spin');
  state.cache.clear();
  $$('.mblock').forEach((b) => { delete b.dataset.loaded; });
  try {
    await loadCategories();
    loadNote('daily').then(renderBell);
    loadBriefs();
    if (state.view === 'month') {
      // 지금 보이는 달 위주로 다시 불러오기
      const st = scrollTop();
      const shown = $$('.mblock').filter((b) => { const y0 = docTop(b); return y0 + b.offsetHeight > st - 800 && y0 < st + vh() + 800; });
      await Promise.all(shown.map((b) => { const [y, m] = b.dataset.ym.split('-').map(Number); return loadMonth(y, m - 1, { force: true }); }));
      renderDayPanel();
    } else await renderAgenda();
    loadTasks();
    if (state.page === 1) loadNote('briefing');
    if (!silent) toast(tr('Synced'));
  } finally {
    refreshing = false;
    $('#refreshBtn').classList.remove('spin');
  }
}

/* ───────────── Tasks (구 Spaces): 영역별 할 일 ───────────── */
async function loadTasks() {
  try {
    const [areas, tasks, topics] = await Promise.all([api('/api/areas'), api('/api/tasks'), api('/api/topics')]);
    state.areas = areas; state.tasks = tasks; state.topics = topics; tasksVer++;
  } catch { return; }
  prefetchNotes(researchNoteKeys());
  repaintMonths();
  if (state.page === 2) renderSpaces();
  if (state.page === 1) renderWorkstream();
}

/* ───────────── 페이지: Calendar(0) · Workstream(1) · Tasks(2) ─────────────
   좌우로 밀어서 이동. 손가락을 따라 움직이고, 놓은 속도(관성)에 따라 넘어가거나 제자리로 돌아옵니다. */
const MINP = 0, MAXP = 2;
const pageEls = () => [[$('#app'), $('#dayPanel')], [$('#workstream')], [$('#spaces')]]; // 배열 i 번째 = 페이지 i + MINP
state.page = 0;
let pageTimer = null;
/** offset: 화면이 이동한 양(px). page × 화면너비 일 때 그 페이지가 정확히 보임 */
function placePages(offset, animate, ms = 340) {
  const w = vw();
  const ease = `${ms}ms cubic-bezier(.2,.85,.25,1)`;
  pageEls().forEach((els, i) => {
    const x = (i + MINP) * w - offset;
    for (const el of els) {
      el.style.transition = animate ? `transform ${ease}` : 'none';
      el.style.transform = Math.abs(x) < 0.5 ? '' : `translateX(${x}px)`;
    }
  });
}
function showPages(...idx) { for (const p of idx) { const el = pageEls()[p - MINP]?.[0]; if (el && p !== 0) el.hidden = false; } }
function hideOffPages() { pageEls().forEach(([el], i) => { const p = i + MINP; if (p !== 0 && p !== state.page) el.hidden = true; }); }
/** 손을 뗀 속도로 남은 거리를 마무리 (빠르게 튕기면 빨리, 천천히 놓으면 부드럽게) */
function settleMs(remaining, v) {
  const speed = Math.abs(v); // px/ms
  if (speed < 0.3) return 360;
  return Math.round(Math.min(420, Math.max(180, (remaining / speed) * 1.6)));
}
function goPage(p, { ms = 340, animate = true } = {}) {
  p = Math.max(MINP, Math.min(MAXP, p));
  const prev = state.page;
  state.page = p;
  showPages(prev, p);
  if (p !== prev) {
    if (p === 1) { renderWorkstream(); loadWorkstream().then(() => { if (state.page === 1) renderWorkstream(); }); }
    if (p === 2) { $('#spaces').scrollTop = 0; renderSpaces(); loadTasks(); }
  }
  placePages(p * vw(), animate, ms);
  document.body.style.overflow = p ? 'hidden' : '';
  if (view.rot) $('#app').style.overflowY = p ? 'hidden' : '';
  clearTimeout(pageTimer);
  return new Promise((r) => { pageTimer = setTimeout(() => { hideOffPages(); r(); }, animate ? ms : 0); });
}
(() => {
  let sx = 0, sy = 0, lastX = 0, lastT = 0, vx = 0, mode = 'off', w = 0, base = 0, off = 0;
  document.addEventListener('touchstart', (e) => {
    mode = 'off';
    if ($('#app').hidden || !$('#sheet').hidden || e.touches.length > 1) return;
    if (e.target.closest('.sp-tabs, .sp-subs, .deadlines, .ws-filter, input, textarea, select')) return; // 가로 스크롤 영역은 제외
    const p0 = pt(e.touches[0]);
    sx = lastX = p0.x; sy = p0.y; lastT = Date.now(); vx = 0;
    w = vw(); base = state.page * w; off = base; mode = 'wait';
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (mode === 'off') return;
    const p1 = pt(e.touches[0]);
    const x = p1.x, dx = x - sx, dy = p1.y - sy;
    if (mode === 'wait') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.4) {
        mode = 'drag';
        clearTimeout(pageTimer);
        showPages(state.page - 1, state.page + 1);
        if (state.page === 0 && dx < 0) renderWorkstream();
        if (state.page === 1 && dx < 0) renderSpaces();
      } else { mode = 'off'; return; }
    }
    e.preventDefault();
    const now = Date.now();
    const inst = (x - lastX) / Math.max(1, now - lastT);
    vx = vx * 0.6 + inst * 0.4; lastX = x; lastT = now;
    off = base - dx;
    // 옆 페이지까지만, 양 끝에서는 고무줄처럼
    off = Math.max(base - w, Math.min(base + w, off));
    if (off < MINP * w) off = MINP * w + (off - MINP * w) * 0.25;
    if (off > MAXP * w) off = MAXP * w + (off - MAXP * w) * 0.25;
    placePages(off, false);
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (mode !== 'drag') { mode = 'off'; return; }
    mode = 'off';
    const dx = lastX - sx;
    let target = state.page;
    if (dx < -w * 0.3 || vx < -0.45) target = state.page + 1;
    else if (dx > w * 0.3 || vx > 0.45) target = state.page - 1;
    target = Math.max(MINP, Math.min(MAXP, target));
    goPage(target, { ms: settleMs(Math.abs(target * w - off), vx) });
  });
  // 노트북 트랙패드 가로 스와이프
  let acc = 0, accTimer;
  window.addEventListener('wheel', (e) => {
    if ($('#app').hidden || !$('#sheet').hidden || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    acc += e.deltaX; clearTimeout(accTimer); accTimer = setTimeout(() => { acc = 0; }, 200);
    if (acc > 90) { acc = 0; goPage(state.page + 1); }
    else if (acc < -90) { acc = 0; goPage(state.page - 1); }
  }, { passive: true });
})();
$('#spAdd').addEventListener('click', () => openTaskEditor(null));

function fmtDue(due) {
  if (!due) return '';
  return `${fmt(due.date, { month: 'short', day: 'numeric' })}${due.time ? ` ${due.time}` : ''}`;
}
function fmtAlarm(a) {
  const [d, t] = a.split('T');
  return `${shortDate(d)} · ${t}`;
}

function renderSpaces() {
  $('#spNotice').hidden = true;
  // 상위 카테고리 탭 (한 줄)
  const open = state.tasks.filter((t) => !t.done);
  const tabs = [{ id: 'all', name: tr('All') }, ...state.areas];
  if (state.spaceTab !== 'all' && !state.areas.some((a) => a.id === state.spaceTab)) { state.spaceTab = 'all'; state.spaceSub = null; }
  $('#spTabs').innerHTML = tabs.map((a) => {
    const n = a.id === 'all' ? open.length : open.filter((t) => t.areaId === a.id).length;
    return `<button class="sp-tab" data-id="${esc(a.id)}" aria-selected="${state.spaceTab === a.id}">${a.color ? `<i class="dot" style="--c:${a.color}"></i>` : ''}${esc(a.name)}${n ? ` <span class="cnt">${n}</span>` : ''}</button>`;
  }).join('');
  $$('.sp-tab').forEach((b) => b.addEventListener('click', () => {
    state.spaceTab = b.dataset.id; state.spaceSub = null; renderSpaces();
  }));
  // 하위 카테고리 줄 (상위를 눌렀을 때만, 글씨 버튼)
  const area = state.areas.find((a) => a.id === state.spaceTab);
  const subRow = $('#spSubs');
  if (area && area.tags?.length) {
    subRow.hidden = false;
    subRow.innerHTML = [['', tr('All')], ...area.tags.map((g) => [g, g])].map(([v, label]) => {
      const n = open.filter((t) => t.areaId === area.id && (!v || t.tag === v)).length;
      return `<button class="sp-sub" data-v="${esc(v)}" aria-selected="${(state.spaceSub || '') === v}">${esc(label)}${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
    }).join('');
    $$('.sp-sub').forEach((b) => b.addEventListener('click', () => { state.spaceSub = b.dataset.v || null; renderSpaces(); }));
  } else { subRow.hidden = true; subRow.innerHTML = ''; }

  // 목록 (그룹: 지남 · 오늘 · 이번 주 · 나중에 · 날짜 없음 · 완료)
  let list = state.spaceTab === 'all' ? state.tasks : state.tasks.filter((t) => t.areaId === state.spaceTab);
  if (state.spaceSub) list = list.filter((t) => t.tag === state.spaceSub);
  const t0 = today(), week = addDays(t0, 7);
  const groups = [
    [tr('Overdue'), list.filter((t) => !t.done && t.overdue), 'overdue'],
    [tr('Today'), list.filter((t) => !t.done && !t.overdue && t.due?.date === t0)],
    [tr('Next 7 days'), list.filter((t) => !t.done && !t.overdue && t.due && t.due.date > t0 && t.due.date <= week)],
    [tr('Later'), list.filter((t) => !t.done && !t.overdue && t.due && t.due.date > week)],
    [tr('No date'), list.filter((t) => !t.done && !t.due)],
  ];
  const done = list.filter((t) => t.done);
  let html = groups.filter(([, items]) => items.length).map(([name, items, cls]) => `
    <section class="sp-group ${cls || ''}"><h3>${name}</h3><ul class="task-list">${items.map(taskRow).join('')}</ul></section>`).join('');
  if (!html) html = '<p class="empty-note" data-i18n="Nothing here">Nothing here</p>';
  if (done.length) {
    html += state.showDone
      ? `<section class="sp-group"><h3 data-i18n="Done">Done</h3><ul class="task-list">${done.map(taskRow).join('')}</ul></section><button class="show-done" id="toggleDone" data-i18n="Hide done">Hide done</button>`
      : `<button class="show-done" id="toggleDone">${tr('Show done')} (${done.length})</button>`;
  }
  $('#spList').innerHTML = html;
  $('#toggleDone')?.addEventListener('click', () => { state.showDone = !state.showDone; renderSpaces(); });
  $$('.task', $('#spList')).forEach((el) => {
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    $('.check', el).addEventListener('click', () => toggleDone(t));
    $('.task-body', el).addEventListener('click', (e) => {
      const link = e.target.closest('.ws-link');
      if (link) { goPage(1).then(() => openTopic(state.topics.find((x) => x.id === link.dataset.topic))); return; }
      openTask(t);
    });
  });
}

function taskRow(t) {
  const meta = [`<span><i class="dot" style="--c:${t.areaColor}"></i>${esc(t.area)}${t.tag ? ` · ${esc(t.tag)}` : ''}</span>`];
  if (t.due) {
    const label = t.overdue ? `<b class="late" data-i18n="Overdue">Overdue</b>` : `<b class="dd">${t.dday === 0 ? 'D-day' : `D-${t.dday}`}</b>`;
    meta.push(`<span>${t.done ? '' : label} ${fmtDue(t.due)}</span>`);
  }
  if (t.nextAlarm && !t.done) meta.push(`<span>${ICON.bell}${fmt(t.nextAlarm.slice(0, 10), { month: 'short', day: 'numeric' })} ${t.nextAlarm.slice(11)}</span>`);
  if (t.topicId) meta.push(`<span class="ws-link" data-topic="${t.topicId}" style="--c:${t.topicColor}"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>${esc(t.topicName)}</span>`);
  return `<li class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <button class="check" aria-label="${t.done ? tr('Mark not done') : tr('Mark done')}"><span>${ICON.check}</span></button>
    <button class="task-body"><span class="t-title">${esc(t.title)}</span><span class="t-meta">${meta.join('')}</span></button>
  </li>`;
}

async function toggleDone(t) {
  t.done = !t.done; // 즉시 반영
  renderSpaces();
  try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { done: t.done } }); toast(t.done ? tr('Done') : tr('Reopened')); loadTasks(); }
  catch (e) { t.done = !t.done; renderSpaces(); toast(e.message, true); }
}

function openTaskById(id) { const t = state.tasks.find((x) => x.id === id); if (t) openTask(t); }

function openTask(t) {
  const rows = [`<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="${t.areaColor}" stroke="none"/></svg><span>${esc(t.area)}${t.tag ? ` · ${esc(t.tag)}` : ''}</span></div>`];
  rows.push(`<div>${ICON.flag}<span>${t.due
    ? `${longDate(t.due.date)}${t.due.time ? ` · ${t.due.time}` : ''}${!t.done ? ` · <span class="dday">${t.overdue ? tr('Overdue') : t.dday === 0 ? 'D-day' : `D-${t.dday}`}</span>` : ''}`
    : tr('No due date')}</span></div>`);
  rows.push(`<div>${ICON.bell}<span>${(t.alarms || []).length
    ? t.alarms.map((a) => `<span class="${(t.sent || []).includes(a) ? 'sent' : ''}">${fmtAlarm(a)}${(t.sent || []).includes(a) ? ' ✓' : ''}</span>`).join('<br>')
    : tr('No alarms')}</span></div>`);
  if (t.topicId) rows.splice(1, 0, `<div><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg><button class="row-link" id="tTopic" style="color:${t.topicColor}">${esc(t.topicName)} <span class="tagc">[${esc(t.topicTag)}]</span></button></div>`);
  if (t.start && t.due && t.start !== t.due.date) rows.splice(t.topicId ? 3 : 2, 0, `<div>${ICON.clock}<span>${tr('Start')} ${longDate(t.start)}</span></div>`);
  if (t.notes) rows.push(`<div>${ICON.note}<span class="notes">${esc(t.notes)}</span></div>`);
  openSheet(`
    <div class="sheet-head"><span class="muted" style="font-size:13px;color:var(--ink-3)">${t.source === 'claude' ? locale() === 'ko-KR' ? `${esc(AI.name)} 추가` : `Added by ${esc(AI.name)}` : tr('Added by you')}${t.createdAt ? ` · ${fmt(ymd(new Date(t.createdAt)), { month: 'short', day: 'numeric' })}` : ''}</span><button class="link" data-close data-i18n="Close">Close</button></div>
    <h2 class="detail-title">${esc(t.title)}</h2>
    ${(() => { const n = t.uid && state.notes[`task-${t.uid}`]; return `<button class="tp-note task-note" id="tNote" ${n ? '' : 'hidden'}>${n ? noteCardInner(n, 3) : ''}</button>`; })()}
    <div class="detail-rows">${rows.join('')}</div>
    <div class="actions-3">
      <button class="btn danger" id="tDel" data-i18n="Delete">Delete</button>
      <button class="btn ghost" id="tEdit" data-i18n="Edit">Edit</button>
      <button class="btn primary" id="tDone">${t.done ? tr('Mark not done') : tr('Mark done')}</button>
    </div>`);
  $('[data-close]').addEventListener('click', closeSheet);
  $('#tDone').addEventListener('click', () => { closeSheet(); toggleDone(t); });
  $('#tEdit').addEventListener('click', () => openTaskEditor(t));
  $('#tTopic')?.addEventListener('click', () => goPage(1).then(() => openTopic(state.topics.find((x) => x.id === t.topicId))));
  // 이 할 일에 대한 AI 노트(브리핑·자료 조사)가 있으면 맨 위에
  if (t.uid) {
    const key = `task-${t.uid}`;
    $('#tNote').onclick = () => { stackSheet(() => openTask(state.tasks.find((x) => x.id === t.id) || t)); openNote(key); };
    // 미리 받아 둔 게 없을 때만 (드묾) 나중에 채움
    if (state.notes[key] === undefined) loadNote(key).then((n) => {
      const el = $('#tNote'); if (!el || !n || !el.hidden) return;
      el.hidden = false; el.innerHTML = noteCardInner(n, 3);
    });
  }
  $('#tDel').addEventListener('click', async () => {
    try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); closeSheet(); toast(tr('Deleted')); loadTasks(); }
    catch (e) { toast(e.message, true); }
  });
}

function openTaskEditor(t, preset = {}) {
  const isNew = !t;
  const researchArea = state.areas.find((a) => (a.tags || []).includes('프로젝트'));
  let areaId = t?.areaId || (state.spaceTab !== 'all' ? state.spaceTab : state.areas[0]?.id);
  let tag0 = t?.tag || (isNew && state.spaceSub) || '';
  if (isNew && preset.topicId && researchArea) { areaId = researchArea.id; tag0 = '프로젝트'; }
  const f = { title: t?.title || '', areaId, tag: tag0, dueDate: t?.due?.date || '', dueTime: t?.due?.time || '', alarms: [...(t?.alarms || [])], notes: t?.notes || '', topicId: t ? t.topicId : (preset.topicId || null), start: t?.start || '' };
  const topicChoices = state.topics.filter((x) => x.status !== 'closed' || x.id === f.topicId);
  const tagChips = () => {
    const area = state.areas.find((a) => a.id === f.areaId);
    return (area?.tags || []).map((g) => `<button type="button" class="chip" data-tag="${esc(g)}" style="--c:${area.color}" aria-pressed="${f.tag === g}">${esc(g)}</button>`).join('');
  };
  openSheet(`
    <div class="sheet-head"><h2>${isNew ? tr('New item') : tr('Edit item')}</h2><button class="link" data-close data-i18n="Cancel">Cancel</button></div>
    <form class="form" id="tForm" novalidate>
      <input class="title-input" name="title" placeholder="What needs doing?" data-i18n-placeholder="What needs doing?" value="${esc(f.title)}" autocomplete="off">
      <div class="chips" id="areaChips">${state.areas.map((a) => `<button type="button" class="chip" data-id="${a.id}" style="--c:${a.color}" aria-pressed="${a.id === f.areaId}"><i class="dot"></i>${esc(a.name)}</button>`).join('')}</div>
      <div class="chips" id="tagChips">${tagChips()}<input class="tag-in" name="tag" placeholder="Tag" data-i18n-placeholder="Tag" value="${esc(f.tag)}"></div>
      ${topicChoices.length ? `<p class="sec-label" data-i18n="Workstream">Workstream</p><div class="chips" id="topicChips"><button type="button" class="chip" data-tp="" aria-pressed="${!f.topicId}" data-i18n="None">None</button>${topicChoices.map((x) => `<button type="button" class="chip" data-tp="${x.id}" style="--c:${x.color}" aria-pressed="${x.id === f.topicId}"><i class="dot"></i>${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="group">
        <div class="row" id="startRow" ${f.topicId || f.start ? '' : 'hidden'}><span class="lbl" data-i18n="Start">Start</span><div class="inputs"><input type="date" name="start" value="${f.start}"></div></div>
        <div class="row"><span class="lbl" data-i18n="Due">Due</span><div class="inputs"><input type="date" name="dueDate" value="${f.dueDate}"><input type="time" name="dueTime" value="${f.dueTime}"></div></div>
      </div>
      <p class="sec-label" data-i18n="Alarms">Alarms</p>
      <div class="alarm-rows" id="alarmRows"></div>
      <button type="button" class="add-alarm" id="addAlarm" data-i18n="+ Add alarm">+ Add alarm</button>
      <textarea class="notes-in" name="notes" placeholder="Notes" data-i18n-placeholder="Notes">${esc(f.notes)}</textarea>
      <button class="btn primary" type="submit">${isNew ? tr('Add') : tr('Save')}</button>
    </form>`);
  const form = $('#tForm');
  $('[data-close]').addEventListener('click', closeSheet);
  if (isNew) setTimeout(() => form.title.focus(), 300);
  const drawAlarms = () => {
    $('#alarmRows').innerHTML = f.alarms.map((a, i) => `<div class="alarm-row"><input type="datetime-local" data-i="${i}" value="${a}"><button type="button" class="icon-btn sm" data-rm="${i}" aria-label="Remove" data-i18n-aria-label="Remove">${ICON.x}</button></div>`).join('');
    $$('#alarmRows input').forEach((inp) => inp.addEventListener('change', () => { f.alarms[+inp.dataset.i] = inp.value; }));
    $$('#alarmRows [data-rm]').forEach((b) => b.addEventListener('click', () => { f.alarms.splice(+b.dataset.rm, 1); drawAlarms(); }));
  };
  drawAlarms();
  $('#addAlarm').addEventListener('click', () => {
    const due = form.dueDate.value;
    const base = due ? (diffDays(today(), due) > 1 ? addDays(due, -1) : due) : addDays(today(), 1);
    f.alarms.push(`${base}T${due && form.dueTime.value && base === due ? form.dueTime.value : '09:00'}`);
    drawAlarms();
  });
  $('#topicChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    f.topicId = b.dataset.tp || null;
    $$('.chip', $('#topicChips')).forEach((c) => c.setAttribute('aria-pressed', c === b));
    $('#startRow').hidden = !f.topicId && !form.start.value;
  });
  $('#areaChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    f.areaId = b.dataset.id;
    $$('.chip', $('#areaChips')).forEach((c) => c.setAttribute('aria-pressed', c === b));
    const input = form.tag.value;
    $('#tagChips').innerHTML = `${tagChips()}<input class="tag-in" name="tag" placeholder="Tag" data-i18n-placeholder="Tag" value="${esc(input)}">`;
  });
  $('#tagChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    $$('.chip', $('#tagChips')).forEach((c) => c.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', on);
    form.tag.value = on ? b.dataset.tag : '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    const body = {
      title, areaId: f.areaId, tag: form.tag.value.trim() || null, notes: form.notes.value,
      dueDate: form.dueDate.value || null, dueTime: form.dueDate.value && form.dueTime.value ? form.dueTime.value : null,
      alarms: f.alarms.filter(Boolean),
      topic: f.topicId || 'none', startDate: form.start.value || null,
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (isNew) await api('/api/tasks', { method: 'POST', body });
      else await api(`/api/tasks/${t.id}`, { method: 'PATCH', body });
      toast(isNew ? tr('Added') : tr('Saved'));
      if (preset.topicId) { await loadTasks(); openTopic(state.topics.find((x) => x.id === preset.topicId)); }
      else { closeSheet(); loadTasks(); }
    } catch (err) { btn.disabled = false; toast(err.message, true); }
  });
}

/* ───────────── Workstream: 프로젝트별 관리 ───────────── */
const RESEARCH_TAGS = ['프로젝트'];
const TOPIC_COLORS = ['#6A9BCC', '#7C9A5A', '#C46A9A', '#E3A13B', '#4C9A8F', '#8F7BC8', '#D97757'];
const STATUS_LABEL = { planned: tr('Planned'), active: tr('Active'), closed: tr('Closed') };
const sundayOf = (d) => addDays(d, -parse(d).getDay());
Object.assign(state, { topics: [], wsWeek: sundayOf(today()), wsFilter: 'all', notes: {}, noteSeen: store.get('noteSeen', {}) });

async function loadWorkstream() {
  await Promise.all([loadTasks(), loadNote('briefing')]);
}
async function loadNote(key) {
  try {
    const { note } = await api(`/api/notes/${encodeURIComponent(key)}`);
    const prev = state.notes[key];
    state.notes[key] = note;
    if (note?.updatedAt !== prev?.updatedAt) onNoteChanged(key);
    return note;
  } catch { return state.notes[key] || null; }
}
function onNoteChanged(key) {
  if (key === 'daily') renderBell();
  else if (state.page === 1) renderWorkstream();
  // 열려 있는 노트 화면도 새 내용으로
  const open = $('#noteView');
  if (open && open.dataset.key === key) openNote(key);
}
// 외부 AI가 저장한 브리핑을 화면에 반영합니다. 예약 실행은 AI 서비스에서 관리합니다.
function refreshBriefingNotes() {
  if (document.hidden || !$('#login').hidden) return;
  loadNote('daily');
  if (state.page === 1) loadNote('briefing');
}
setInterval(refreshBriefingNotes, 30_000);

const topicTasks = (id) => state.tasks.filter((t) => t.topicId === id);
function topicStats(tp) {
  const mine = topicTasks(tp.id);
  const done = mine.filter((t) => t.done);
  const open = mine.filter((t) => !t.done);
  const wk0 = sundayOf(today()), wk1 = addDays(wk0, 6);
  const dueThisWeek = open.filter((t) => t.due && t.due.date >= wk0 && t.due.date <= wk1).length;
  const slips = done.filter((t) => t.due && t.doneAt).map((t) => diffDays(t.due.date, ymd(new Date(t.doneAt))));
  const avgSlip = slips.length ? slips.reduce((a, b) => a + b, 0) / slips.length : null;
  const weekly = [];
  for (let i = 5; i >= 0; i--) {
    const s0 = addDays(wk0, -7 * i), s1 = addDays(s0, 6);
    weekly.push({ label: i === 0 ? tr('This wk') : fmt(s0, { month: 'numeric', day: 'numeric' }), n: done.filter((t) => { const d = ymd(new Date(t.doneAt || 0)); return d >= s0 && d <= s1; }).length });
  }
  const next = open.filter((t) => t.due).sort((a, b) => a.due.date.localeCompare(b.due.date))[0] || null;
  return { total: mine.length, done: done.length, open, dueThisWeek, avgSlip, weekly, next };
}
const ddLabel = (t) => (t.overdue ? tr('Overdue') : t.dday === 0 ? 'D-day' : `D-${t.dday}`);
const titleTagRe = (tag) => new RegExp(`^\\s*\\[${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`, 'i');
function eventTopic(e) {
  const m = /^\s*\[([^\]]{1,20})\]/.exec(e.title || '');
  return m ? state.topics.find((t) => t.tag.toLowerCase() === m[1].trim().toLowerCase()) || null : null;
}
function suggestTopic(t) {
  const text = `${t.title} ${t.notes || ''}`.toLowerCase();
  let best = null, score = 0;
  for (const tp of state.topics.filter((x) => x.status !== 'closed')) {
    const words = [tp.tag, tp.name, ...(tp.keywords || [])].map((w) => w.toLowerCase()).filter(Boolean);
    const sc = words.filter((w) => text.includes(w)).length;
    if (sc > score) { score = sc; best = tp; }
  }
  return best;
}
const unsortedTasks = () => state.tasks.filter((t) => !t.done && !t.topicId && RESEARCH_TAGS.includes(t.tag));

function noteTime(n) {
  const d = new Date(n.updatedAt), day = ymd(d);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return day === today() ? `${tr('Today')} ${hm}` : `${fmt(day, { month: 'short', day: 'numeric' })} ${hm}`;
}
function notePreview(text, lines = 2) {
  // 제목·날짜 줄은 빼고 내용 줄만
  return text.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l) && !l.trim().startsWith('📅') && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l))
    .map((l) => l.replace(/^\s*[-*•]\s+|^\s*\d+[.)]\s+/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim())
    .filter(Boolean).slice(0, lines).join(' · ');
}

function renderWorkstream() {
  const ws = $('#workstream');
  if (!ws || ws.hidden && state.page !== 1) { /* 그려 두면 스와이프할 때 바로 보임 */ }
  // Claude 브리핑 카드
  const bn = state.notes.briefing;
  const card = $('#wsBrief');
  if (bn) {
    const unseen = state.noteSeen.briefing !== bn.updatedAt;
    card.hidden = false;
    card.innerHTML = `<span class="cb-head">${STAR}<b>${esc(AI.name)}</b><span>${tr('Project briefing')} · ${noteTime(bn)}</span>${unseen ? '<i class="new-dot" aria-label="Updated" data-i18n-aria-label="Updated"></i>' : ''}</span>
      <span class="cb-text">${esc(notePreview(bn.text, 3))}</span>`;
  } else card.hidden = true;

  // 상태 필터
  const cnt = (st) => state.topics.filter((t) => t.status === st).length;
  $('#wsFilter').innerHTML = [['all', tr('All'), state.topics.length], ['active', tr('Active'), cnt('active')], ['planned', tr('Planned'), cnt('planned')], ['closed', tr('Closed'), cnt('closed')]]
    .map(([k, l, n]) => `<button data-f="${k}" aria-selected="${state.wsFilter === k}">${l}${n && k !== 'all' ? `<span>${n}</span>` : ''}</button>`).join('');
  $$('#wsFilter button').forEach((b) => b.addEventListener('click', () => { state.wsFilter = b.dataset.f; renderWorkstream(); }));

  renderWeek();

  // 미분류
  const un = unsortedTasks();
  const ur = $('#wsUnsorted');
  ur.hidden = !un.length;
  ur.innerHTML = `<span data-i18n="Unsorted">Unsorted</span><b>${un.length}</b><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`;

  // 주제 목록
  const shown = state.topics.filter((t) => state.wsFilter === 'all' || t.status === state.wsFilter)
    .sort((a, b) => ['active', 'planned', 'closed'].indexOf(a.status) - ['active', 'planned', 'closed'].indexOf(b.status));
  $('#wsTopics').innerHTML = shown.length ? shown.map((tp) => {
    const st = topicStats(tp);
    const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    return `<button class="topic-card ${tp.status}" data-id="${tp.id}" style="--c:${tp.color}">
      <span class="r1"><i class="dot"></i><b>${esc(tp.name)}</b><span class="tagc">[${esc(tp.tag)}]</span><span class="pill p-${tp.status}">${STATUS_LABEL[tp.status]}</span></span>
      <span class="prog"><i style="width:${pct}%"></i></span>
      <span class="meta"><span>${locale() === 'ko-KR' ? `${st.total}개 중 ${st.done}개 완료` : `${st.done} of ${st.total} done`}</span>${st.next ? `<span>${tr('Next')} <b>${esc(st.next.title)} ${ddLabel(st.next)}</b></span>` : tp.target ? `<span>${tr('Target')} ${fmt(tp.target, { month: 'short', day: 'numeric' })}</span>` : ''}</span>
    </button>`;
  }).join('') : `<button class="add-inline" id="wsFirst">${ICON.plus}${tr('New topic')}</button>`;
  $$('.topic-card').forEach((b) => b.addEventListener('click', () => openTopic(state.topics.find((t) => t.id === b.dataset.id))));
  $('#wsFirst')?.addEventListener('click', () => openTopicEditor(null));
}

async function renderWeek() {
  const w0 = state.wsWeek, w6 = addDays(w0, 6), t0 = today();
  $('#wsRange').textContent = `${fmt(w0, { month: 'short', day: 'numeric' })} – ${parse(w0).getMonth() === parse(w6).getMonth() ? parse(w6).getDate() : fmt(w6, { month: 'short', day: 'numeric' })}`;
  $('#wsThisWeek').hidden = w0 === sundayOf(t0);
  $('#wsDays').innerHTML = [...Array(7)].map((_, i) => { const d = addDays(w0, i); return `<div class="${d === t0 ? 'today' : ''}">${(locale() === 'ko-KR' ? '일월화수목금토' : 'SMTWTFS')[i]}<b>${parse(d).getDate()}</b></div>`; }).join('');
  const todayIdx = diffDays(w0, t0);
  const vlines = [...Array(7)].map((_, i) => `<i class="${i === todayIdx ? 't' : ''}"></i>`).join('');

  let events = [];
  try { events = visible(await fetchRange(w0, w6)); } catch { /* 일정 없이 표시 */ }
  if (state.wsWeek !== w0) return;

  const topics = state.topics.filter((t) => (state.wsFilter === 'all' ? t.status !== 'closed' : t.status === state.wsFilter));
  const col = (d) => Math.max(0, Math.min(6, diffDays(w0, d)));
  const lanes = topics.map((tp) => {
    const items = [];
    for (const t of topicTasks(tp.id)) {
      if (!t.due) continue;
      const e = t.due.date, s = t.start && t.start <= e ? t.start : e;
      if (e < w0 || s > w6) continue;
      items.push({ kind: 'task', t, s, e });
    }
    for (const ev of events) {
      if (eventTopic(ev)?.id !== tp.id) continue;
      items.push({ kind: 'event', ev, s: ev.startDate, e: ev.endDate });
    }
    // 겹치지 않게 줄 나누기
    items.sort((a, b) => a.s.localeCompare(b.s) || b.e.localeCompare(a.e));
    const rowEnds = [];
    for (const it of items) {
      let r = rowEnds.findIndex((end) => end < it.s);
      if (r < 0) { r = rowEnds.length; rowEnds.push(it.e); } else rowEnds[r] = it.e;
      it.row = r + 1;
    }
    return { tp, items };
  }).filter((l) => l.items.length || l.tp.status === 'active');

  const bar = (it, i) => {
    const before = it.s < w0, after = it.e > w6;
    const gc = `grid-column:${col(it.s) + 1}/${col(it.e) + 2};grid-row:${it.row}`;
    if (it.kind === 'event') {
      const title = it.ev.title.replace(titleTagRe(it.tp?.tag || ''), '');
      return `<button class="ws-ev" data-ev="${i}" style="${gc}">${esc(title)}</button>`;
    }
    const t = it.t;
    const flag = !t.done && !after && t.dday !== null && t.dday <= 7 ? `<span class="flag">${ddLabel(t)}</span>` : '';
    return `<button class="ws-bar ${t.done ? 'done' : ''} ${before ? 'from' : ''} ${after ? 'cont' : ''}" data-t="${t.id}" style="${gc}">
      <span>${esc(t.title)}${after ? ` → ${fmt(t.due.date, { month: 'numeric', day: 'numeric' })}` : ''}</span>${flag}</button>`;
  };
  const evList = [];
  $('#wsBoard').innerHTML = `<div class="vlines">${vlines}</div>` + (lanes.length ? lanes.map(({ tp, items }) => `
    <div class="lane" style="--c:${tp.color}">
      <div class="lane-h"><i class="dot"></i>${esc(tp.name)}<span class="tagc">[${esc(tp.tag)}]</span></div>
      <div class="rows">${items.length ? items.map((it) => { if (it.kind === 'event') { it.tp = tp; evList.push(it.ev); return bar(it, evList.length - 1); } return bar(it); }).join('') : '<span class="lane-empty">—</span>'}</div>
    </div>`).join('') : '<p class="ws-none" data-i18n="No project tasks this week">No project tasks this week</p>');
  $$('#wsBoard .ws-bar').forEach((b) => b.addEventListener('click', () => { const t = state.tasks.find((x) => x.id === b.dataset.t); if (t) openTask(t); }));
  $$('#wsBoard .ws-ev').forEach((b) => b.addEventListener('click', () => openDetail(evList[+b.dataset.ev])));
}

$('#wsPrev').addEventListener('click', () => { state.wsWeek = addDays(state.wsWeek, -7); renderWeek(); });
$('#wsNext').addEventListener('click', () => { state.wsWeek = addDays(state.wsWeek, 7); renderWeek(); });
$('#wsThisWeek').addEventListener('click', () => { state.wsWeek = sundayOf(today()); renderWeek(); });
$('#wsAdd').addEventListener('click', () => openTopicEditor(null));
$('#wsBrief').addEventListener('click', () => openNote('briefing'));
$('#wsUnsorted').addEventListener('click', openUnsorted);

/* 주제 상세 */
async function openTopic(tp) {
  if (!tp) return;
  const st = topicStats(tp);
  const daysLeft = tp.target ? diffDays(today(), tp.target) : null;
  const slip = st.avgSlip === null ? '—' : `${st.avgSlip > 0 ? '+' : ''}${st.avgSlip.toFixed(1)}d`;
  const maxW = Math.max(1, ...st.weekly.map((w) => w.n));
  const doneList = topicTasks(tp.id).filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 5);
  const openList = st.open.sort((a, b) => (a.due?.date || '9999').localeCompare(b.due?.date || '9999'));
  const trow = (t) => `<button class="tp-task ${t.done ? 'dn' : ''}" data-t="${t.id}">
      <i class="ck ${t.done ? 'on' : ''}"></i>
      <span class="tt">${esc(t.title)}<small>${t.done ? `${tr('Done')} ${fmt(ymd(new Date(t.doneAt || Date.now())), { month: 'short', day: 'numeric' })}` : `${t.start && t.due && t.start !== t.due.date ? `${fmt(t.start, { month: 'short', day: 'numeric' })} → ` : ''}${t.due ? fmt(t.due.date, { month: 'short', day: 'numeric' }) : tr('No date')}`}</small></span>
      <span class="dd ${!t.done && t.due && t.dday <= 3 ? 'hot' : ''}">${!t.done && t.due ? ddLabel(t) : ''}</span>
    </button>`;
  openSheet(`
    <div class="sheet-head"><span class="crumb" data-i18n="Workstream">Workstream</span><button class="link" id="tpEdit" data-i18n="Edit">Edit</button></div>
    <div class="tp-headrow">
      <h2 class="tp-title" style="--c:${tp.color}"><i class="dot"></i>${esc(tp.name)}</h2>
      <div class="statesel">${['planned', 'active', 'closed'].map((k) => `<button data-st="${k}" aria-selected="${tp.status === k}">${k === 'active' ? tr('In progress') : STATUS_LABEL[k]}</button>`).join('')}</div>
    </div>
    <div class="tp-dates">${tp.start ? `<span>${tr('Started')} <b>${fmt(tp.start, { month: 'short', day: 'numeric' })}</b></span>` : ''}${tp.target ? `<span>${tr('Target')} <b>${fmt(tp.target, { month: 'short', day: 'numeric', year: parse(tp.target).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</b></span>` : ''}${daysLeft !== null && tp.status !== 'closed' ? `<span class="${daysLeft < 0 ? 'late' : 'left'}">${daysLeft < 0 ? locale() === 'ko-KR' ? `${-daysLeft}일 지남` : `${-daysLeft} days over` : locale() === 'ko-KR' ? `${daysLeft}일 남음` : `${daysLeft} days left`}</span>` : ''}</div>

    <section class="tp-card tp-brief" id="tpBrief" ${tp.brief || state.notes[tp.id] ? '' : 'hidden'}>
      <h3 data-i18n="Brief">Brief</h3>
      ${tp.brief ? `<p>${esc(tp.brief)}</p>` : ''}
      <button class="tp-note" id="tpNote" ${state.notes[tp.id] ? '' : 'hidden'}>${state.notes[tp.id] ? noteCardInner(state.notes[tp.id], 3) : ''}</button>
    </section>

    <section class="tp-card">
      <h3 data-i18n="Progress">Progress</h3>
      <div class="facts"><div><b>${st.done}/${st.total}</b>done</div><div><b class="${st.dueThisWeek ? 'warn' : ''}">${st.dueThisWeek}</b>due this week</div><div><b>${slip}</b>avg. slip</div></div>
      <div class="spark">${st.weekly.map((w, i) => `<i class="${i === 5 ? 'now' : ''}" style="height:${Math.max(4, w.n / maxW * 100)}%" title="${w.n}"></i>`).join('')}</div>
      <div class="sparkx">${st.weekly.map((w) => `<span>${w.label}</span>`).join('')}</div>
    </section>

    <section class="tp-card">
      <h3 data-i18n="Tasks">Tasks</h3>
      ${openList.map(trow).join('')}${doneList.map(trow).join('')}
      <button class="add-inline" id="tpAddTask">${ICON.plus}Add task</button>
    </section>

    <section class="tp-card" id="tpLinked" hidden><h3 data-i18n="From calendar">From calendar</h3><div id="tpLinkedList"></div></section>`);
  $('#tpEdit').addEventListener('click', () => openTopicEditor(tp));
  $$('.statesel button').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.st === tp.status) return;
    try { const { result } = { result: await api('/api/topics', { method: 'POST', body: { op: 'update', topic: tp.id, status: b.dataset.st } }) }; await loadTasks(); openTopic(state.topics.find((t) => t.id === result.id)); }
    catch (e) { toast(e.message, true); }
  }));
  $$('.tp-task').forEach((b) => b.addEventListener('click', () => { const t = state.tasks.find((x) => x.id === b.dataset.t); if (t) { stackSheet(() => openTopic(state.topics.find((x) => x.id === tp.id) || tp)); openTask(t); } }));
  // Claude 노트가 있는 할 일에 ✦ 표시
  const starRow = (t, n) => {
    const row = n && $(`.tp-task[data-t="${CSS.escape(t.id)}"] .tt`);
    if (row && !row.querySelector('.star')) row.insertAdjacentHTML('afterbegin', STAR);
  };
  for (const t of topicTasks(tp.id)) if (t.uid) {
    const k = `task-${t.uid}`;
    if (state.notes[k] !== undefined) starRow(t, state.notes[k]); else loadNote(k).then((n) => starRow(t, n));
  }
  $('#tpAddTask').addEventListener('click', () => openTaskEditor(null, { topicId: tp.id }));

  // AI 노트, 캘린더 연결 일정 (비동기)
  $('#tpNote').onclick = () => { stackSheet(() => openTopic(state.topics.find((x) => x.id === tp.id) || tp)); openNote(tp.id); };
  if (state.notes[tp.id] === undefined) loadNote(tp.id).then((n) => {
    const el = $('#tpNote'); if (!el || !n || !el.hidden) return;
    el.hidden = false; $('#tpBrief').hidden = false; el.innerHTML = noteCardInner(n, 3);
  });
  fetchRange(today(), addDays(today(), 60)).then((evs) => {
    const mine = visible(evs).filter((e) => eventTopic(e)?.id === tp.id);
    if (!mine.length || !$('#tpLinked')) return;
    $('#tpLinked').hidden = false;
    $('#tpLinkedList').innerHTML = mine.slice(0, 6).map((e, i) => `<button class="tp-ev" data-i="${i}"><i class="evd"></i>${esc(e.title.replace(titleTagRe(tp.tag), ''))}<span>${fmt(e.startDate, { month: 'short', day: 'numeric' })}${e.startTime ? ` ${e.startTime}` : ''}</span></button>`).join('');
    $$('.tp-ev').forEach((b) => b.addEventListener('click', () => openDetail(mine[+b.dataset.i])));
  }).catch(() => {});
}

/* 주제 만들기 / 고치기 */
function openTopicEditor(tp) {
  const isNew = !tp;
  const f = tp ? { ...tp, keywords: (tp.keywords || []).join(', ') } : { name: '', tag: '', color: TOPIC_COLORS[state.topics.length % TOPIC_COLORS.length], status: 'active', start: today(), target: '', brief: '', keywords: '' };
  openSheet(`
    <div class="sheet-head"><h2>${isNew ? tr('New topic') : tr('Edit topic')}</h2><button class="link" data-close data-i18n="Cancel">Cancel</button></div>
    <form class="form" id="tpForm" novalidate>
      <input class="title-input" name="name" placeholder="Project name" data-i18n-placeholder="Project name" value="${esc(f.name)}" autocomplete="off">
      <div class="group">
        <div class="row"><span class="lbl" data-i18n="Tag">Tag</span><div class="inputs tag-field">[<input name="tag" value="${esc(f.tag)}" placeholder="MoS2" data-i18n-placeholder="MoS2" autocomplete="off" maxlength="20">]</div></div>
        <div class="row"><span class="lbl" data-i18n="Status">Status</span><select name="status">${['planned', 'active', 'closed'].map((k) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${k === 'active' ? tr('In progress') : STATUS_LABEL[k]}</option>`).join('')}</select></div>
        <div class="row"><span class="lbl" data-i18n="Start">Start</span><input type="date" name="start" value="${f.start || ''}"></div>
        <div class="row"><span class="lbl" data-i18n="Target">Target</span><input type="date" name="target" value="${f.target || ''}"></div>
      </div>
      <div class="swatches">${TOPIC_COLORS.map((c) => `<button type="button" class="swatch" data-c="${c}" style="--c:${c}" aria-pressed="${c === f.color}"></button>`).join('')}</div>
      <textarea class="notes-in" name="brief" placeholder="Summary — what this project is about" data-i18n-placeholder="Summary — what this project is about">${esc(f.brief || '')}</textarea>
      <input class="kw-in" name="keywords" placeholder="Keywords, comma separated" data-i18n-placeholder="Keywords, comma separated" value="${esc(f.keywords)}" autocomplete="off">
      <button class="btn primary" type="submit">${isNew ? tr('Create') : tr('Save')}</button>
      ${isNew ? '' : '<button class="btn danger" type="button" id="tpDel" data-i18n="Delete topic">Delete topic</button>'}
    </form>`);
  const form = $('#tpForm');
  $('[data-close]').addEventListener('click', closeSheet);
  if (isNew) setTimeout(() => form.name.focus(), 300);
  form.name.addEventListener('input', () => { if (isNew && !form.tag.dataset.touched) form.tag.value = form.name.value.trim().split(/\s+/)[0] || ''; });
  form.tag.addEventListener('input', () => { form.tag.dataset.touched = '1'; });
  $$('.swatch', form).forEach((s) => s.addEventListener('click', () => { f.color = s.dataset.c; $$('.swatch', form).forEach((x) => x.setAttribute('aria-pressed', x === s)); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.name.value.trim()) { form.name.focus(); return; }
    const body = {
      op: isNew ? 'create' : 'update', topic: tp?.id, name: form.name.value.trim(), tag: form.tag.value.trim(), status: form.status.value,
      start: form.start.value || null, target: form.target.value || null, color: f.color, brief: form.brief.value.trim(), keywords: form.keywords.value,
    };
    try {
      const saved = await api('/api/topics', { method: 'POST', body });
      await loadTasks(); toast(isNew ? tr('Created') : tr('Saved'));
      openTopic(state.topics.find((t) => t.id === saved.id) || saved);
    } catch (err) { toast(err.message, true); }
  });
  $('#tpDel')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${tp.name}”? Its tasks stay in Tasks.`)) return;
    try { await api('/api/topics', { method: 'POST', body: { op: 'delete', topic: tp.id } }); closeSheet(); toast(tr('Deleted')); loadTasks(); }
    catch (err) { toast(err.message, true); }
  });
}

/* 미분류: 프로젝트를 못 정한 할 일 */
function openUnsorted() {
  const items = unsortedTasks();
  if (!items.length) { closeSheet(); return; }
  openSheet(`
    <div class="sheet-head"><h2 data-i18n="Unsorted">Unsorted</h2><button class="link" data-close data-i18n="Done">Done</button></div>
    <div class="group un-list">${items.map((t) => {
      const sg = suggestTopic(t);
      return `<div class="un-item" data-id="${t.id}"><span class="t"><b>${esc(t.title)}</b><small>${t.due ? fmt(t.due.date, { month: 'short', day: 'numeric' }) + ' · ' : ''}${esc(t.area)}${t.tag ? ` › ${esc(t.tag)}` : ''}</small></span>
        ${sg ? `<button class="pick" data-topic="${sg.id}" style="--c:${sg.color}"><i class="dot"></i>${esc(sg.name)}</button>` : ''}<button class="pick none" data-choose>${sg ? '⋯' : 'Choose'}</button></div>`;
    }).join('')}</div>
    `);
  $('[data-close]').addEventListener('click', closeSheet);
  $$('.un-item').forEach((row) => {
    const t = state.tasks.find((x) => x.id === row.dataset.id);
    $('[data-topic]', row)?.addEventListener('click', (e) => assignTopic(t, e.currentTarget.dataset.topic));
    $('[data-choose]', row).addEventListener('click', () => chooseTopic(t));
  });
}
function chooseTopic(t) {
  openSheet(`
    <div class="sheet-head"><h2>${esc(t.title)}</h2><button class="link" data-close data-i18n="Cancel">Cancel</button></div>
    <div class="group">${state.topics.filter((x) => x.status !== 'closed').map((tp) => `<button class="choose-row" data-topic="${tp.id}" style="--c:${tp.color}"><i class="dot"></i>${esc(tp.name)}<span class="tagc">[${esc(tp.tag)}]</span></button>`).join('')}
      <button class="choose-row muted" data-not data-i18n="Not a project">Not a project</button></div>`);
  $('[data-close]').addEventListener('click', openUnsorted);
  $$('[data-topic]').forEach((b) => b.addEventListener('click', () => assignTopic(t, b.dataset.topic)));
  $('[data-not]').addEventListener('click', async () => {
    try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { tag: null } }); await loadTasks(); openUnsorted(); } catch (e) { toast(e.message, true); }
  });
}
async function assignTopic(t, topicId) {
  try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { topic: topicId } }); await loadTasks(); toast(tr('Filed')); openUnsorted(); }
  catch (e) { toast(e.message, true); }
}

/* Claude 노트 보기 (Claude 대화처럼) */
function mdToHtml(md) {
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(md).split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = /^(#{1,4})\s+(.*)/.exec(line))) { close(); const lv = Math.min(4, m[1].length + 1); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { close(); out.push('<hr>'); continue; }
    if ((m = /^\s*[-*•]\s+(.*)/.exec(line))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)/.exec(line))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('');
}
function openNote(key) {
  const n = state.notes[key];
  const daily = key === 'daily';
  if (!n) {
    if (daily) openSheet(`<div class="sheet-head"><span class="crumb" data-i18n="Briefing">Briefing</span><button class="link" data-close data-i18n="Close">Close</button></div><p id="noteView" data-key="daily" class="empty-note" data-i18n="No briefing yet">No briefing yet</p>`), $('[data-close]').addEventListener('click', closeSheet);
    return;
  }
  state.noteSeen[key] = n.updatedAt; store.set('noteSeen', state.noteSeen);
  const isTask = key.startsWith('task-');
  const tk = isTask ? state.tasks.find((t) => `task-${t.uid}` === key) : null;
  const tp = key === 'briefing' || daily || isTask || key.startsWith('ev-') ? null : state.topics.find((t) => t.id === key);
  const evb = key.startsWith('ev-') ? Object.values(state.briefs || {}).find((b) => b.key === key) : null;
  const label = tk ? tk.title : evb ? evb.title : n.title || (tp ? tp.name : null);
  const url = n.url || `${AI.url}${encodeURIComponent(label ? `${label} 이어서 얘기하자` : '오늘 프로젝트 브리핑 이어서 얘기하자')}`;
  openSheet(`
    <div class="sheet-head"><span class="crumb">${label ? esc(label) : daily ? tr('Briefing') : tr('Project briefing')}</span><button class="link" data-close data-i18n="Close">Close</button></div>
    <article class="claude-msg" id="noteView" data-key="${esc(key)}">
      <div class="cm-head">${STAR}<b>${esc(AI.name)}</b><span>${noteTime(n)}</span></div>
      <div class="cm-body">${mdToHtml(n.text)}</div>
    </article>
    ${daily ? '' : `<div class="cfab-wrap"><a class="claude-fab" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open in ${esc(AI.name)}">${STAR}</a></div>`}`);
  $('[data-close]').addEventListener('click', closeSheet);
  if (key === 'briefing' && state.page === 1) renderWorkstream();
  if (daily) renderBell();
}

/* 캘린더 화면의 일정 브리핑 (종 버튼) */
function renderBell() {
  const n = state.notes.daily;
  $('#bellBtn .new-dot').hidden = !(n && state.noteSeen.daily !== n.updatedAt && ymd(new Date(n.updatedAt)) === today());
}
$('#bellBtn').addEventListener('click', async () => { await loadNote('daily'); openNote('daily'); });

/* ───────────── 이벤트 연결 ───────────── */
function goToday() {
  if (state.view !== 'month') { state.view = 'month'; renderHeader(); }
  const t = new Date();
  if (!$(`.mblock[data-ym="${ymKey(t.getFullYear(), t.getMonth())}"]`)) buildMonths();
  scrollToMonth(t.getFullYear(), t.getMonth());
  setTimeout(() => selectDay(today()), 350);
}
$('#todayBtn').addEventListener('click', goToday);
$('#monthTitle').addEventListener('click', goToday);
$('#refreshBtn').addEventListener('click', () => refresh({ silent: false }));
$('#catBtn').addEventListener('click', openCategories);
$$('.views button').forEach((b) => b.addEventListener('click', () => {
  if (state.view === b.dataset.view) return;
  state.view = b.dataset.view;
  closeDayPanel();
  renderHeader();
  if (state.view === 'month') { const t = new Date(); scrollToMonth(t.getFullYear(), t.getMonth(), false); } else { scroller().scrollTo(0, 0); renderAgenda(); }
}));
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if ($('#login').hidden) {
    refreshBriefingNotes();
    if (Date.now() - hiddenAt > 30_000) refresh();
  }
});
window.addEventListener('resize', () => { if (!$('#app').hidden) renderHeader(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// iOS Safari 는 user-scalable=no 를 무시하므로 핀치 확대 제스처를 직접 막음
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

function openAssistantSettings() {
  openSheet(`
    <div class="sheet-head"><h2 data-i18n="Settings">Settings</h2><button class="link" data-close data-i18n="Done">Done</button></div>
    <div class="group settings-group">
      <label class="row"><span class="lbl" data-i18n="Language">Language</span><select id="languageSetting" aria-label="Language" data-i18n-aria-label="Language"><option value="ko" ${locale() === 'ko-KR' ? 'selected' : ''}>한국어</option><option value="en" ${locale() === 'en-US' ? 'selected' : ''}>English</option></select></label>
      <label class="row"><span class="lbl" data-i18n="Theme">Theme</span><select id="themeSetting" aria-label="Theme" data-i18n-aria-label="Theme">${[['auto',tr('Follow assistant')],['claude','Claude'],['chatgpt','ChatGPT']].map(([id,label]) => `<option value="${id}" ${store.get('theme','auto') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>`);
  $('[data-close]').onclick = closeSheet;
  $('#languageSetting').onchange = event => {
    store.set('language', event.target.value);
    try { sessionStorage.setItem('openSettings', '1'); } catch { /* optional navigation state */ }
    location.reload();
  };
  $('#themeSetting').onchange = event => {
    store.set('theme', event.target.value); applyAssistant(AI.id);
  };
}

observeTranslations();

start();
