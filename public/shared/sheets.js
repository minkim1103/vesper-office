// Preserve nested sheet DOM and listeners instead of cloning/rebuilding it.
export function createSheets({$, $$, translate=()=>{}, getVersion=()=>0, onClosed=()=>{}}) {
let closing = null;
/* 시트 위에 시트: 주제 → 할 일처럼 이어서 열면 아래 시트는 그대로 두고 새 시트가 위로 올라옴.
   위 시트를 내리면 아래 시트가 다시 살아남. */
const sheetStack = [];
let pushNext = null;
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
    sheetStack.push({ reopen, ghost, keep, scroll: sh.scrollTop, ver: getVersion() });
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
      if (top.ver !== getVersion()) requestAnimationFrame(() => { top.reopen(); sh.scrollTop = top.scroll; }); // 그사이 데이터가 바뀌었으면 갱신
    }, 245);
    return;
  }
  $('#sheet').classList.remove('pushin'); $('#sheet').classList.add('closing'); $('#scrim').classList.add('closing');
  closing = setTimeout(() => {
    $('#scrim').hidden = true; $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; $('#sheet').style.transform = '';
    $$('.sheet-ghost').forEach((g) => g.remove()); sheetStack.length = 0;
    $('#sheet').classList.remove('closing'); $('#scrim').classList.remove('closing'); closing = null; onClosed();
  }, 220);
}

return {openSheet,closeSheet,stackSheet};
}
