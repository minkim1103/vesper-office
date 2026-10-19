export const messages = {
  'Sign in': '로그인', Today: '오늘', Tomorrow: '내일', Yesterday: '어제', Month: '월', List: '목록', Demo: '데모',
  'Due today': '오늘 마감', View: '보기', 'All done': '모두 완료', 'Show less': '접기',
  'Search events': '일정 검색', 'No search results': '검색 결과가 없습니다', 'Search wider': '검색 범위 넓히기',
  'Load more': '더 보기', Workstream: 'Workstream', 'This week': '이번 주', Topics: '프로젝트', Tasks: '할 일', Password: '비밀번호',
  'Go to today': '오늘로 이동', Briefing: '브리핑', Sync: '동기화', Calendars: '캘린더', Important: '중요', Search: '검색', Day: '하루 일정',
  'New project': '새 프로젝트', 'Previous week': '이전 주', 'Next week': '다음 주', Add: '추가', 'No events': '일정이 없습니다', Close: '닫기',
  Delete: '삭제', Edit: '수정', 'Delete event': '일정 삭제', Cancel: '취소', 'This event only': '이 일정만', 'All events': '모든 반복 일정',
  'All day': '하루 종일', Starts: '시작', Ends: '종료', Repeat: '반복', Never: '반복 안 함', Daily: '매일', Weekly: '매주',
  'Every 2 weeks': '격주', Monthly: '매월', Yearly: '매년', 'Connect Google Calendar': 'Google 캘린더 연결', Done: '완료',
  'New calendar': '새 캘린더', 'Nothing here': '아직 항목이 없습니다', 'Hide done': '완료 항목 숨기기', Overdue: '기한 지남', None: '없음',
  Start: '시작', Due: '마감', Alarms: '알림', '+ Add alarm': '+ 알림 추가', Unsorted: '미분류', 'No project tasks this week': '이번 주 프로젝트 할 일이 없습니다',
  Brief: '요약', Progress: '진행 상황', 'From calendar': '연결된 일정', Tag: '태그', Status: '상태', Target: '목표일', 'Delete topic': '프로젝트 삭제',
  'Not a project': '프로젝트에서 제외', 'No briefing yet': '아직 브리핑이 없습니다', Title: '제목', Name: '이름', 'What needs doing?': '할 일을 입력하세요',
  Notes: '메모', Remove: '삭제', Updated: '업데이트됨', 'Project name': '프로젝트 이름', 'Summary — what this project is about': '프로젝트 요약',
  'Keywords, comma separated': '키워드 (쉼표로 구분)', 'AI briefing': 'AI 브리핑', 'Claude briefing': 'AI 브리핑', Settings: '설정', Language: '언어',
  Theme: '테마', 'Follow assistant': 'AI에 맞추기', Save: '저장', Create: '만들기', 'New event': '새 일정', 'Edit event': '일정 수정', 'New item': '새 할 일', 'Edit item': '할 일 수정',
  'New topic': '새 프로젝트', 'Edit topic': '프로젝트 수정', Added: '추가했습니다', Saved: '저장했습니다', Deleted: '삭제했습니다', Synced: '동기화했습니다',
  Created: '만들었습니다', Reopened: '다시 진행 중으로 바꿨습니다', Filed: '분류했습니다', 'Sign in required': '로그인이 필요합니다',
  'Wrong password': '비밀번호가 맞지 않습니다', 'Next 7 days': '앞으로 7일', Later: '이후', 'No date': '날짜 없음', 'No due date': '마감일 없음',
  'No alarms': '알림 없음', All: '전체', Planned: '예정', Active: '진행 중', Closed: '종료', 'In progress': '진행 중',
  'Mark not done': '완료 취소', 'Mark done': '완료하기', 'Added by you': '직접 추가', 'Project briefing': '프로젝트 브리핑', 'This wk': '이번 주',
  'Show done': '완료 항목 보기', 'Add event': '일정 추가', 'Add item': '할 일 추가', Next: '다음', Started: '시작일',
  Show: '표시', 'Briefing pending': '브리핑 대기 중',
  'due this week': '이번 주 마감', 'avg. slip': '평균 지연', done: '완료', Repeats: '반복',
  '요청을 복사했습니다': 'Request copied', '선택된 내용을 복사해 주세요': 'Copy the selected text',
  '앞으로의 날짜와 시각을 선택해 주세요.': 'Choose a future date and time.',
};

export function getLanguage() {
  try { return JSON.parse(localStorage.getItem('language')) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
}
export const locale = () => getLanguage() === 'ko' ? 'ko-KR' : 'en-US';
export function t(key) {
  if (getLanguage() === 'ko') return /[가-힣]/.test(key) ? key : messages[key] || key;
  return /[가-힣]/.test(key) ? messages[key] || key : key;
}

export function translate(root = document) {
  document.documentElement.lang = getLanguage();
  for (const [attr, target] of [['data-i18n', null], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label']]) {
    const nodes = [...root.querySelectorAll(`[${attr}]`)];
    if (root.nodeType === 1 && root.hasAttribute(attr)) nodes.push(root);
    for (const el of nodes) {
      const value = t(el.getAttribute(attr));
      if (target) { if (el.getAttribute(target) !== value) el.setAttribute(target, value); }
      else if (el.textContent !== value) el.textContent = value;
    }
  }
}

export function observeTranslations() {
  translate();
  // Only translate explicitly marked UI strings. Never inspect user titles or notes.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) translate(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
