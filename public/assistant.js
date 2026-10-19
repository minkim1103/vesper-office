export const ASSISTANTS = {
  claude: { id: 'claude', name: 'Claude', url: 'https://claude.ai/new?q=' },
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?q=' },
};

// A handoff request, never a claim that a task has been created or synchronized.
export function scheduleRequest({ kind = 'daily', time = '09:00', timezone = 'Asia/Seoul', date, title, source = 'connected' } = {}) {
  if (!['daily', 'weekly', 'reminder'].includes(kind)) throw new Error('예약 종류를 확인해 주세요.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('시각은 HH:mm 형식이어야 합니다.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new Error('시간대를 확인해 주세요.'); }
  let request;
  if (kind === 'reminder') {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date || !String(title || '').trim()) throw new Error('알림 제목과 유효한 날짜가 필요합니다.');
    request = `${date} ${time}에 다음 내용을 한 번 알려주는 예약 작업을 만들어 줘: ${String(title).trim()}`;
  } else {
    request = `${kind === 'weekly' ? '매주 월요일' : '매일'} ${time}에 ${kind === 'weekly' ? '이번 주 일정과 마감, 프로젝트 진행 상황' : '오늘 일정, 시간이 겹치는 약속, 임박한 마감과 미완료 할 일'}을 정리하는 예약 작업을 만들어 줘.`;
  }
  return [
    `시간대: ${timezone}.`, request,
    ...(kind === 'reminder' ? ['이 요청은 선택한 항목의 사본이야. Vesper에서 수정·삭제해도 이 예약은 자동으로 바뀌지 않아.'] : [
      source === 'google'
        ? '매 실행 시 ChatGPT에 연결한 Google Calendar에서 최신 일정을 읽어 줘. iCloud 전용 일정과 Vesper 할 일·노트는 Google Calendar에 자동 복제되지 않으니 접근하지 못하면 알려 줘.'
        : '매 실행 시 이 대화에서 사용 가능한 Vesper 연결 도구로 최신 일정과 할 일을 조회해 줘. 도구나 예약 실행에서 연결을 사용할 수 없다면 데이터가 있는 것처럼 작성하지 말고 연결이 필요하다고 알려 줘.',
      'Vesper 읽기·쓰기 도구도 실행 중 사용할 수 있다면 일반 일정 브리핑은 save_daily_briefing으로 저장해 줘. 그렇지 않으면 결과를 이 대화에 보여 줘.',
    ]),
    '예약 기능을 사용할 수 있는지 확인하고, 실제 생성에 성공한 경우에만 예약 완료라고 알려 줘. 다음 실행 시각도 확인해 줘. 같은 예약이 이미 있으면 중복 생성하지 말고 확인해 줘.',
  ].join('\n\n');
}
