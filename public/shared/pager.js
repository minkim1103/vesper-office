// Shared gesture controller. Application pages and data refresh stay in their app.
export function createPager({state,$,vw,view,pt,pageEls,MINP=0,MAXP=2,
  renderPage=()=>{},loadPage=()=>{},onSettled=()=>{},onIdle=()=>{}}) {
let pageResolve = null;
let pageTimer = null, pageFrame = 0, pageOffset = 0, queuedOffset = 0;
let resetPageGesture = () => {};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function cancelPageFrame() { cancelAnimationFrame(pageFrame); pageFrame = 0; }
function queuePageOffset(offset) {
  queuedOffset = offset;
  if (!pageFrame) pageFrame = requestAnimationFrame(() => {
    pageFrame = 0;
    placePages(queuedOffset, false);
  });
}
/** offset: 화면이 이동한 양(px). page × 화면너비 일 때 그 페이지가 정확히 보임 */
function placePages(offset, animate, ms = 340) {
  pageOffset = offset;
  const w = vw();
  const ease = `${ms}ms cubic-bezier(.2,.85,.25,1)`;
  pageEls().forEach((els, i) => {
    const x = (i + MINP) * w - offset;
    for (const el of els) {
      el.style.transition = animate ? `transform ${ease}` : 'none';
      el.style.transform = `translate3d(${Math.abs(x) < 0.5 ? 0 : x}px,0,0)`;
    }
  });
}
function showPages(...idx) {
  for (const p of idx) {
    const el = pageEls()[p - MINP]?.[0];
    if (el && p !== 0 && el.hidden) {
      // Position while still hidden so a newly displayed page cannot flash at x=0.
      el.style.transition = 'none';
      el.style.transform = `translate3d(${p * vw() - pageOffset}px,0,0)`;
      el.hidden = false;
      el.getBoundingClientRect(); // Commit the start position once, outside the drag frame loop.
    }
  }
}
function hideOffPages() {
  placePages(state.page * vw(), false);
  pageEls().forEach((els, i) => {
    const p = i + MINP;
    if (p !== 0) els[0].hidden = p !== state.page;
    for (const el of els) {
      el.style.willChange = '';
      // Preserve fixed calendar children once the transition has finished.
      if (p === state.page) el.style.transform = '';
    }
  });
}
/** 손을 뗀 속도로 남은 거리를 마무리 (빠르게 튕기면 빨리, 천천히 놓으면 부드럽게) */
function settleMs(remaining, v) {
  const speed = Math.abs(v); // px/ms
  if (speed < 0.3) return 360;
  return Math.round(Math.min(420, Math.max(180, (remaining / speed) * 1.6)));
}
function goPage(p, { ms = 340, animate = true } = {}) {
  p = Math.max(MINP, Math.min(MAXP, p));
  animate = animate && !reducedMotion();
  cancelPageFrame();
  const prev = state.page;
  state.page = p;
  if (p !== prev) {
    renderPage(p);
  }
  showPages(prev, p);
  pageEls().forEach(els => els.forEach(el => { el.style.willChange = animate ? 'transform' : ''; }));
  placePages(p * vw(), animate, ms);
  document.body.style.overflow = p ? 'hidden' : '';
  if (view.rot) $('#app').style.overflowY = p ? 'hidden' : '';
  clearTimeout(pageTimer);
  if (pageResolve) { pageResolve(); pageResolve = null; }
  return new Promise((r) => { pageResolve = r; pageTimer = setTimeout(() => {
    pageTimer = null; hideOffPages();
    onIdle();
    onSettled(p);
    if (p !== prev && p === state.page) {
      Promise.resolve(loadPage(p)).catch(() => {});
    }
    pageResolve = null; r();
  }, animate ? ms : 0); });
}
(() => {
  let sx = 0, sy = 0, lastX = 0, lastT = 0, vx = 0, mode = 'off', w = 0, base = 0, off = 0;
  resetPageGesture = () => { mode = 'off'; cancelPageFrame(); };
  document.addEventListener('touchstart', (e) => {
    if (mode === 'drag') goPage(state.page, { animate: false });
    mode = 'off';
    if ($('#app').hidden || !$('#sheet').hidden || e.touches.length > 1) return;
    if (e.target.closest('.sp-tabs, .sp-subs, .deadlines, .ws-filter, input, textarea, select')) return; // 가로 스크롤 영역은 제외
    const p0 = pt(e.touches[0]);
    sx = lastX = p0.x; sy = p0.y; lastT = Date.now(); vx = 0;
    w = vw(); base = state.page * w; off = base; mode = 'wait';
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (mode === 'off') return;
    if (e.touches.length !== 1) { resetPageGesture(); goPage(state.page, { animate: false }); return; }
    const p1 = pt(e.touches[0]);
    const x = p1.x, dx = x - sx, dy = p1.y - sy;
    if (mode === 'wait') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.4) {
        mode = 'drag';
        // Continue from the current animated position if a new gesture interrupts it.
        const selected = pageEls()[state.page - MINP][0];
        const transform = getComputedStyle(selected).transform;
        const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
        base = state.page * w - matrix.m41;
        clearTimeout(pageTimer); pageTimer = null;
        cancelPageFrame();
        pageOffset = base;
        showPages(state.page - 1, state.page + 1);
        renderPage(state.page + (dx < 0 ? 1 : -1));
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
    queuePageOffset(off);
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
  document.addEventListener('touchcancel', () => {
    resetPageGesture(); goPage(state.page, { animate: false });
  });
  // One page per trackpad gesture, including its trailing momentum events.
  let acc = 0, accTimer, wheelLocked = false;
  window.addEventListener('wheel', (e) => {
    if ($('#app').hidden || !$('#sheet').hidden || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (e.target.closest('.sp-tabs, .sp-subs, .deadlines, .ws-filter, input, textarea, select')) return;
    e.preventDefault();
    clearTimeout(accTimer); accTimer = setTimeout(() => { acc = 0; wheelLocked = false; }, 220);
    if (wheelLocked || pageTimer) return;
    acc += e.deltaX;
    if (Math.abs(acc) > 90) {
      wheelLocked = true; goPage(state.page + Math.sign(acc)); acc = 0;
    }
  }, { passive: false });
})();
function realignPages() {
  resetPageGesture();
  goPage(state.page, { animate: false });
}
window.addEventListener('resize', realignPages);
window.addEventListener('pageshow', realignPages);
window.addEventListener('pagehide', realignPages);
document.addEventListener('visibilitychange', () => { if (document.hidden) realignPages(); });
hideOffPages();

return { goPage, realign: realignPages };
}
