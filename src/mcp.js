// AI(Claude·ChatGPT) 연결용 MCP 서버 (Streamable HTTP, 상태 없는 JSON 응답 방식)
import * as svc from './service.js';
import * as tasks from './tasks.js';
import { todayStr, koDate } from './time.js';
import { config } from './config.js';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const DEFAULT_INSTRUCTIONS = `브리핑 작성 시 get_briefing의 briefingStyle을 매번 읽으세요. 현재 사용자의 명시적 요청 > personalInstructions > defaultInstructions 순서로 적용하고 feedbackNotes와 get_note(daily)의 이전 제안을 참고하세요. 가이드의 예시는 실제 일정이 아닙니다. horizon은 향후 일정 자료이며 빈 시간·이동 시간·준비 소요가 확인되지 않으면 추정임을 표시하세요. 브리핑 중 일정·할 일을 임의 변경하지 마세요. 사용자가 스타일 변경을 명시하면 get_briefing_style로 기존 개인 지시를 읽고 필요한 부분만 고쳐 save_briefing_style로 저장하세요. 다른 선호는 유지합니다.
예약 생성·수정·실행은 연결된 AI 서비스에서 관리합니다. 예약 실행 때마다 최신 자료를 조회하고, 일정 브리핑은 save_daily_briefing, 업무 브리핑은 save_briefing으로 마크다운 전문을 저장하세요. 저장하지 않고 대화에만 답하면 웹사이트에 반영되지 않습니다.
이 서버는 사용자의 개인 캘린더입니다. 모든 일정은 사용자의 iCloud(애플 캘린더)와, 연결돼 있다면 Google 캘린더와도 양방향으로 동기화됩니다.
- 시간대: ${config.tz}. 날짜는 YYYY-MM-DD, 시간은 HH:mm(24시간)으로 주고받습니다. "오늘/내일/다음 주 화요일" 같은 표현은 get_today 로 오늘 날짜를 확인한 뒤 계산하세요.
- 카테고리 = 애플 캘린더와 Google 캘린더의 각 캘린더입니다(list_categories 의 provider 로 구분). 모르면 list_categories 로 확인하고, 사용자가 말하지 않았으면 내용에 가장 맞는 카테고리를 고르세요.
- 사용자가 "잊지 않게 알려줘", "마감", "중요", "꼭 해야 해" 같은 말을 하면 '중요' 일정으로 등록하세요(add_deadline 또는 deadline:true). 아이폰 캘린더에는 제목 앞에 [중요] 가 붙습니다. 알림 시점은 사용자의 말에 맞추고, 말이 없으면 기본값(3일 전·1일 전·당일 오전 9시)을 씁니다. 알림은 아이폰 기본 알림으로 울립니다.
- 일정을 수정/삭제할 때는 먼저 list_events 로 id 를 찾고, 비슷한 일정이 여러 개면 사용자에게 어떤 것인지 확인하세요.
- 작업 후에는 무엇을 언제로 등록/변경했는지 한두 줄로 확인해 주세요.

[Tasks: 할 일·기억할 것]
- 사용자는 해야 할 일을 카테고리별로 관리합니다. 기본값은 업무(회의·문서·보고·프로젝트), 개인, 집이고 사용자가 바꿀 수 있습니다. 현재 목록은 list_areas 로 확인하세요.
- "~해야 해", "~까지 제출", "~전에 알려줘", "~예약해야 할 듯"처럼 해야 할 일·기억할 것을 말하면 add_task 로 저장하세요. 저장 위치는 iCloud 의 'Vesper' 캘린더이고, 알람은 아이폰 기본 캘린더 알림으로 울립니다. 사용자가 "일정으로/캘린더에 넣어줘"라고 할 때만 create_event 를 쓰세요.
- dueDate/dueTime = 마감. alarms = 미리 알림 시각 목록("YYYY-MM-DD HH:mm"). 사용자의 말에서 직접 계산하세요. 예:
  · "2주 안에 분기 보고서 초안 끝내야 해" → 업무/보고, due = 오늘+14일, alarms = [마감 3일 전 09:00, 마감 전날 09:00]
  · "11월 7일까지 견적서 제출, 5일 전에 알려줘" → 업무/문서, due 11-07, alarms = ["11-02 09:00"]
  · "친구가 11월 6일에 어디 가자 했는데 2주 전에는 예약해야 할 듯" → 개인, 제목 "11/6 나들이 장소 예약", due = 10-23, alarms = [10-20 09:00, 10-23 09:00], notes 에 맥락
- alarms 를 생략하면 마감 전날 09:00 과 당일 09:00 이 자동으로 들어갑니다. 시각을 말하지 않은 알람은 09:00. 이미 지난 시각은 넣지 마세요.
[Workstream: 프로젝트]
- 프로젝트(topic)는 몇 주~몇 달 이어지는 일의 단위이고, 그 안의 할 일은 주 단위입니다. list_topics 로 프로젝트(이름·태그·상태·요약·키워드)를 확인하세요.
- 프로젝트 관련 할 일은 add_task 에 topic(프로젝트 이름이나 태그)을 넣으세요. 그러면 Tasks(업무 › 프로젝트)와 Workstream 양쪽에 보이고, 아이폰 캘린더 제목 앞에 [태그] 가 붙습니다. 어느 프로젝트인지 애매하면 "○○ 프로젝트에 넣을까요?"라고 먼저 확인하세요.
- 기간이 있는 일은 startDate(시작일)도 넣으면 Workstream 타임라인에 기간 막대로 보입니다.
- 새 프로젝트를 시작한다고 하면 edit_topic(op:create)으로 만들고, 상태(planned/active/closed)·목표일·요약(brief)·키워드를 채우세요. 태그는 짧게(예: Q4).
- 브리핑은 두 가지입니다. 프로젝트 브리핑(save_briefing)은 Workstream 카드에 뜨고 프로젝트들에 대한 조언만 담습니다. 일정 브리핑(save_daily_briefing)은 캘린더의 종 버튼에서 보이고 일정·할 일만 담습니다. 특정 프로젝트에 대한 조언은 save_research_note 로 그 프로젝트에 저장하세요. 이전 내용은 get_note 로 읽을 수 있습니다.
- 일정 브리핑에는 비서가 "미리 해두면 좋을 것"을 슬쩍 제안합니다. 사용자가 그 제안에 "이건 아냐", "좋다", "이런 건 추천하지 마"처럼 반응하면 get_note(key="prefs") 로 메모를 읽고, 반응을 한 줄(날짜·제안 내용·맞다/아니다·이유)로 덧붙여 save_secretary_notes 로 저장하세요. 저장했다고 짧게 알려 주세요.

- 카테고리는 자유롭게 만들고 바꿀 수 있습니다(edit_categories). 하위 카테고리는 tag 로 넣고, 처음 쓰는 tag 는 자동으로 하위 카테고리에 추가됩니다. 새 상위 카테고리가 필요하면 먼저 사용자에게 확인한 뒤 add_area 하세요.
- 완료하면 update_task 로 done:true. 등록 후 "무엇을 / 마감 / 알람"을 한 줄로 확인해 주세요.`;

const alertsDesc = '알림 시점 배열 (시작 몇 분 전). 예: 10=10분 전, 60=1시간 전, 1440=1일 전. 하루종일 일정은 자정 기준이라 -540=당일 오전 9시, 900=전날 오전 9시, 3780=3일 전 오전 9시, 9540=1주 전 오전 9시.';
const recurrenceSchema = {
  type: 'object',
  description: '반복 규칙. 없으면 생략. 반복 해제는 {"freq":"NONE"}',
  properties: {
    freq: { type: 'string', enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
    interval: { type: 'integer', minimum: 1, description: '간격 (2 = 격주/격월 등)' },
    byday: { type: 'array', items: { type: 'string' }, description: '주간 반복 요일. 예: ["MO","WE"]' },
    count: { type: 'integer', description: '총 반복 횟수' },
    until: { type: 'string', description: '반복 종료일 YYYY-MM-DD' },
  },
  required: ['freq'],
};
const eventProps = {
  title: { type: 'string', description: '일정 제목' },
  category: { type: 'string', description: '카테고리(캘린더) 이름. 예: 업무, 개인' },
  startDate: { type: 'string', description: '시작 날짜 YYYY-MM-DD' },
  startTime: { type: 'string', description: '시작 시간 HH:mm. 하루종일 일정이면 생략' },
  endDate: { type: 'string', description: '종료 날짜 YYYY-MM-DD (여러 날 일정일 때)' },
  endTime: { type: 'string', description: '종료 시간 HH:mm (생략 시 1시간)' },
  allDay: { type: 'boolean', description: '하루종일 일정 여부 (startTime 없으면 자동으로 true)' },
  location: { type: 'string' },
  notes: { type: 'string', description: '메모' },
  alerts: { type: 'array', items: { type: 'number' }, description: alertsDesc },
  deadline: { type: 'boolean', description: '중요 일정 표시 (앱과 브리핑에서 D-day 로 강조, 제목 앞에 [중요])' },
  recurrence: recurrenceSchema,
};

const INSTRUCTIONS = config.profile.instructions?.({ tz: config.tz, defaultInstructions: DEFAULT_INSTRUCTIONS }) || DEFAULT_INSTRUCTIONS;

const TOOLS = [
  {
    name: 'get_today',
    description: '오늘 날짜와 요일, 현재 시각(사용자 시간대)을 알려줍니다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const t = todayStr();
      const now = new Intl.DateTimeFormat('ko-KR', { timeZone: config.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      return { today: t, label: koDate(t), now, timezone: config.tz };
    },
  },
  {
    name: 'list_categories',
    description: '일정 카테고리(애플 캘린더 목록)와 색상을 보여줍니다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => (await svc.listCategories()).map(svc.publicCategory),
  },
  {
    name: 'list_events',
    description: '기간 내 일정을 조회합니다. 반복 일정은 회차별로 펼쳐서 보여줍니다. 수정/삭제에 필요한 id 도 여기서 얻습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '시작 날짜 YYYY-MM-DD (기본: 오늘)' },
        to: { type: 'string', description: '끝 날짜 YYYY-MM-DD, 포함 (기본: 30일 뒤)' },
        category: { type: 'string', description: '특정 카테고리만' },
        query: { type: 'string', description: '제목/장소/메모 검색어' },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const events = await svc.listEvents({ from: a.from, to: a.to, categories: a.category ? [a.category] : null, query: a.query });
      return events.map(slim);
    },
  },
  {
    name: 'get_briefing',
    description: '브리핑 재료: 오늘·내일 일정, 향후 horizon 일정, 겹침, 중요 마감, 할 일, 프로젝트와 briefingStyle(기본·개인 지시·피드백). 매 실행마다 새로 읽고 개인 지시를 기본 가이드보다 우선해 작성하세요. text는 원시 요약입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '기준 날짜 YYYY-MM-DD (기본: 오늘)' },
        days: { type: 'integer', description: '중요 일정을 살펴볼 기간(일), 기본 14' },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const b = await svc.briefing({ date: a.date, days: a.days || 14 });
      return {
        text: b.text, today: b.today.map(slim), deadlines: b.deadlines.map((e) => ({ ...slim(e), dday: e.dday })), tomorrow: b.tomorrow.map(slim), conflicts: b.conflicts,
        tasks: { overdue: b.tasks.overdue.map(slimTask), upcoming: b.tasks.upcoming.map(slimTask), alarmsToday: b.tasks.alarmsToday.map(slimTask) },
        research: b.research, ...(config.profile.legacyBriefing ? {} : {horizon: b.horizon.map(slim), planningTasks: b.planningTasks.map(slimTask), briefingStyle: b.briefingStyle}),
      };
    },
  },
  {
    name: 'create_event',
    description: '새 일정을 추가합니다. 아이폰 캘린더에도 바로 반영됩니다.',
    inputSchema: { type: 'object', properties: eventProps, required: ['title', 'startDate'] },
    run: async (a) => ({ created: slim(await svc.createEvent(a)) }),
  },
  {
    name: 'add_deadline',
    description: '잊으면 안 되는 중요한 일(마감 등)을 중요 일정으로 등록하고 미리 알림을 겁니다. remindDaysBefore 로 며칠 전부터 알릴지 정합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueDate: { type: 'string', description: '날짜(마감일) YYYY-MM-DD' },
        dueTime: { type: 'string', description: '시각 HH:mm (없으면 하루종일)' },
        category: { type: 'string' },
        remindDaysBefore: { type: 'array', items: { type: 'integer' }, description: '며칠 전에 알릴지. 기본 [3,1,0] (0 = 당일)' },
        remindAt: { type: 'string', description: '알림 시각 HH:mm (하루종일 일정일 때, 기본 09:00)' },
        notes: { type: 'string' },
      },
      required: ['title', 'dueDate'],
    },
    run: async (a) => {
      const days = a.remindDaysBefore?.length ? a.remindDaysBefore : [3, 1, 0];
      let alerts;
      if (a.dueTime) alerts = days.map((d) => (d === 0 ? 60 : d * 1440));
      else {
        const [h, m] = (a.remindAt || '09:00').split(':').map(Number);
        alerts = days.map((d) => d * 1440 - (h * 60 + m));
      }
      const ev = await svc.createEvent({
        title: a.title, category: a.category, startDate: a.dueDate, startTime: a.dueTime,
        endTime: a.dueTime ? undefined : undefined, allDay: !a.dueTime, notes: a.notes, deadline: true, alerts,
      });
      return { created: slim(ev) };
    },
  },
  {
    name: 'update_event',
    description: '일정을 수정합니다. 바꿀 항목만 넣으세요. 반복 일정은 전체 시리즈가 수정됩니다. category 를 바꾸면 다른 캘린더로 옮겨집니다.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'list_events 에서 받은 id' }, ...eventProps }, required: ['id'] },
    run: async ({ id, ...rest }) => ({ updated: slim(await svc.updateEvent(id, rest)) }),
  },
  {
    name: 'delete_event',
    description: '일정을 삭제합니다. 반복 일정의 한 회차만 지우려면 occurrence 를 함께 넘기세요.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        occurrence: { type: 'string', description: '반복 일정 회차 값 (list_events 의 occurrence). 없으면 전체 삭제' },
      },
      required: ['id'],
    },
    annotations: { destructiveHint: true },
    run: async (a) => svc.deleteEvent(a.id, { occurrence: a.occurrence }),
  },
  {
    name: 'create_category',
    description: '새 카테고리(애플 캘린더)를 만듭니다.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, color: { type: 'string', description: '#RRGGBB' } },
      required: ['name'],
    },
    run: async (a) => {
      return { created: svc.publicCategory(await svc.createCategory(a.name, a.color)) };
    },
  },
];

const taskSchema = {
  title: { type: 'string', description: '할 일 제목 (짧고 구체적으로, [태그] 는 붙이지 마세요)' },
  topic: { type: 'string', description: '프로젝트 이름이나 태그 (프로젝트 할 일일 때). 연결을 끊으려면 "none"' },
  startDate: { type: 'string', description: '시작일 YYYY-MM-DD (기간이 있는 작업일 때)' },
  area: { type: 'string', description: '영역 이름: 업무, 개인, 집 등' },
  tag: { type: 'string', description: '하위 분류. 예: 회의, 문서, 보고, 프로젝트' },
  dueDate: { type: 'string', description: '마감 날짜 YYYY-MM-DD (없으면 생략)' },
  dueTime: { type: 'string', description: '마감 시각 HH:mm (없으면 생략)' },
  alarms: { type: 'array', items: { type: 'string' }, description: '알림 시각 목록 "YYYY-MM-DD HH:mm". 생략하면 마감일 09:00(또는 마감 시각) 하나' },
  notes: { type: 'string', description: '세부 내용·맥락' },
};
const slimTask = (t) => {
  const o = { id: t.id, title: t.title, area: t.area };
  if (t.tag) o.tag = t.tag;
  if (t.due) o.due = t.due.time ? `${t.due.date} ${t.due.time}` : t.due.date;
  if (t.alarms?.length) o.alarms = t.alarms.map((a) => a.replace('T', ' '));
  if (t.notes) o.notes = t.notes;
  if (t.done) o.done = true;
  if (t.overdue) o.overdue = true;
  if (t.topicName) o.topic = `${t.topicName} [${t.topicTag}]`;
  if (t.start) o.start = t.start;
  return o;
};

TOOLS.push(
  {
    name: 'list_areas',
    description: 'Tasks 카테고리 목록(업무·개인·집 등)과 하위 카테고리를 보여줍니다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => (await tasks.listAreas()).map((a) => ({ name: a.name, color: a.color, subs: a.tags })),
  },
  {
    name: 'list_tasks',
    description: 'Tasks 의 할 일 목록을 보여줍니다 (마감 순).',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: '특정 카테고리만' }, tag: { type: 'string', description: '특정 하위 카테고리만' },
        topic: { type: 'string', description: '특정 프로젝트만' },
        includeDone: { type: 'boolean', description: '완료한 것도 포함 (기본 false)' },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => (await tasks.listTasks({ area: a.area, tag: a.tag, topic: a.topic, includeDone: !!a.includeDone })).map(slimTask),
  },
  {
    name: 'add_task',
    description: '해야 할 일·기억할 것을 Tasks(iCloud Vesper 캘린더)에 저장하고 아이폰 알림을 겁니다.',
    inputSchema: { type: 'object', properties: taskSchema, required: ['title', 'area'] },
    run: async (a) => ({ added: slimTask(await tasks.addTask({ ...a, source: 'claude' })) }),
  },
  {
    name: 'update_task',
    description: '할 일을 수정하거나 완료 처리합니다. 바꿀 항목만 넣으세요. alarms 를 넣으면 기존 알람 목록을 통째로 바꿉니다.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...taskSchema, done: { type: 'boolean' } }, required: ['id'] },
    run: async ({ id, ...rest }) => ({ updated: slimTask(await tasks.updateTask(id, rest)) }),
  },
  {
    name: 'delete_task',
    description: '할 일을 삭제합니다.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { destructiveHint: true },
    run: async (a) => tasks.deleteTask(a.id),
  },
  {
    name: 'list_topics',
    description: 'Workstream 프로젝트 목록: 이름·[태그]·상태(planned/active/closed)·시작/목표일·요약·키워드와 진행 현황.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const [topics, list] = await Promise.all([tasks.listTopics(), tasks.listTasks()]);
      return topics.map((t) => {
        const mine = list.filter((x) => x.topicId === t.id);
        return { ...t, done: mine.filter((x) => x.done).length, total: mine.length, open: mine.filter((x) => !x.done).map(slimTask) };
      });
    },
  },
  {
    name: 'edit_topic',
    description: '프로젝트를 만들거나(op:create) 고치거나(op:update) 지웁니다(op:delete). 태그를 바꾸면 연결된 할 일 제목의 [태그] 도 함께 바뀝니다.',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['create', 'update', 'delete'] },
        topic: { type: 'string', description: 'update/delete 대상 (이름·태그·id)' },
        name: { type: 'string' },
        tag: { type: 'string', description: '짧은 태그. 예: Q4 (아이폰 캘린더 제목 앞 [Q4])' },
        status: { type: 'string', enum: ['planned', 'active', 'closed'] },
        start: { type: 'string', description: 'YYYY-MM-DD' },
        target: { type: 'string', description: '목표 마감 YYYY-MM-DD' },
        brief: { type: 'string', description: '프로젝트 요약 1~3줄' },
        keywords: { type: 'array', items: { type: 'string' } },
        color: { type: 'string', description: '#RRGGBB' },
      },
      required: ['op'],
    },
    run: async ({ op, ...a }) => ({ result: await tasks.editTopic(op, a) }),
  },
  {
    name: 'save_briefing',
    description: 'Workstream 맨 위 AI 카드에 들어갈 "프로젝트 브리핑"(마크다운)을 저장합니다. Workstream 의 프로젝트 전체에 대한 진행 조언만 담고, 일반 일정·할 일은 넣지 마세요(그건 save_daily_briefing). 사용자가 고쳐 달라고 하면 다시 호출해 덮어쓰세요.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: '프로젝트 브리핑 전문 (마크다운)' },
        url: { type: 'string', description: '이 대화의 주소를 알면 넣으세요 (앱의 이어서 대화하기 버튼이 여기로 연결)' },
      },
      required: ['markdown'],
    },
    run: async (a) => ({ saved: (await tasks.saveNote('briefing', { text: a.markdown, url: a.url })).updatedAt }),
  },
  {
    name: 'save_daily_briefing',
    description: '일반 일정 브리핑(오늘 일정·중요 일정·할 일·내일, 마크다운)을 저장합니다. 앱의 캘린더 화면 종 버튼에서 보입니다. 프로젝트 조언은 넣지 마세요.',
    inputSchema: {
      type: 'object',
      properties: { markdown: { type: 'string', description: '일정 브리핑 전문 (마크다운)' } },
      required: ['markdown'],
    },
    run: async (a) => ({ saved: (await tasks.saveNote('daily', { text: a.markdown })).updatedAt }),
  },
  {
    name: 'save_task_note',
    description: '할 일 하나에 대한 AI 노트(마크다운)를 저장합니다. 앱에서 그 할 일을 누르면 맨 위 AI 카드로 보입니다. 자료 조사 같은 할 일은 여기에 조사 전문(자료·방법·링크)을 넣고, 프로젝트 브리핑에는 짧게만 쓰세요. task 는 할 일 제목·id·uid 중 하나(list_tasks 의 uid 가 가장 정확).',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '할 일 제목, id 또는 uid' },
        markdown: { type: 'string', description: '노트 전문 (마크다운)' },
        url: { type: 'string', description: '이 대화의 claude.ai 주소 (알면)' },
      },
      required: ['task', 'markdown'],
    },
    run: async (a) => {
      let { key, task } = await tasks.taskNoteKey(a.task).then((r) => (typeof r === 'string' ? { key: r, task: null } : r));
      if (!task) task = (await tasks.listTasks({ includeDone: true })).find((t) => `task-${t.uid}` === key) || null;
      const src = task ? tasks.srcHash(task.title, task.notes) : undefined; // 메모가 바뀌면 다시 브리핑하려고
      const doc = await tasks.saveNote(key, { text: a.markdown, url: a.url, title: task?.title, src });
      return { saved: doc.updatedAt, key, task: task?.title };
    },
  },
  {
    name: 'check_task_notes',
    description: '프로젝트 할 일(주제에 연결된, 끝나지 않은 할 일)의 AI 노트 상태. 각 항목: uid, title, topic, notes(사용자 메모), due, hasNote, memoChanged(지난 노트 이후 사용자가 제목·메모를 바꿨으면 true). memoChanged 가 true 인 할 일은 바뀐 메모를 반영해 노트를 다시 써서 save_task_note 로 저장하세요.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const list = (await tasks.listTasks({ includeDone: false })).filter((t) => t.topicId && !t.done);
      const out = [];
      for (const t of list) {
        const key = `task-${t.uid}`;
        let n = await tasks.getNote(key).catch(() => null);
        const src = tasks.srcHash(t.title, t.notes);
        if (n && !n.src) n = await tasks.stampNote(key, src).catch(() => n); // 예전 노트: 지금 메모를 기준점으로
        out.push({ uid: t.uid, title: t.title, topic: t.topicName, notes: t.notes || '', due: t.due?.date || null, hasNote: !!n, memoChanged: !!n && !!n.src && n.src !== src, noteUpdatedAt: n?.updatedAt || null });
      }
      return { tasks: out };
    },
  },
  {
    name: 'get_briefing_style',
    description: '기본 브리핑 가이드, 개인별 변경 지시와 피드백 메모를 읽습니다. 개인 지시가 기본 가이드보다 우선합니다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => tasks.getBriefingStyle(),
  },
  {
    name: 'save_briefing_style',
    description: '사용자가 명시한 개인 브리핑 스타일을 저장합니다. 먼저 get_briefing_style로 기존 지시를 읽고 요청한 부분만 수정해 전체를 저장하세요. markdown 빈 문자열은 기본값으로 초기화합니다. 브리핑 작성만 요청했을 때는 호출하지 마세요.',
    inputSchema: { type: 'object', properties: { markdown: { type: 'string', maxLength: 12000 } }, required: ['markdown'] },
    run: async a => tasks.saveBriefingStyle(a.markdown),
  },
  {
    name: 'save_secretary_notes',
    description: '비서 학습 메모(마크다운)를 통째로 저장합니다. 사용자가 브리핑의 "미리 해두면 좋을 것" 제안이나 브리핑 방식에 대해 좋다/아니다/이렇게 해 달라고 반응하면, 먼저 get_note(key="prefs")로 기존 메모를 읽고 그 반응을 한 줄로 덧붙여(날짜와 함께, 무엇이 왜 맞거나 틀렸는지) 전체를 다시 저장하세요. 아침 브리핑이 이 메모를 읽고 제안 방식을 맞춥니다.',
    inputSchema: { type: 'object', properties: { markdown: { type: 'string', description: '메모 전문 (기존 내용 + 새 줄)' } }, required: ['markdown'] },
    run: async (a) => ({ saved: (await tasks.saveNote('prefs', { text: a.markdown })).updatedAt }),
  },
  {
    name: 'list_event_briefs',
    description: '사용자가 일정 편집에서 "AI briefing" 을 켜 둔 일반 일정 목록. 각 항목: eventId, key(노트 키), title, date, notes(사용자가 적은 메모 — 브리핑의 핵심 재료), noteUpdatedAt(기존 브리핑 시각, 없으면 null), needsBriefing(브리핑이 없거나 제목·메모가 지난 브리핑 이후 바뀌었으면 true — 이 항목만 새로 조사), memoChanged(메모가 바뀌어서 다시 하는 경우 true). 아이폰 캘린더에서 고친 제목·메모도 여기서 자동 반영됩니다.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      let items = await tasks.listBriefs();
      // 실제 일정의 최신 제목·메모·날짜로 맞춤 (아이폰에서 고친 경우)
      for (const [eventId, b] of Object.entries(items)) {
        const ev = await svc.getEvent(eventId).catch(() => null);
        if (!ev) continue;
        if ((ev.title || '') !== (b.title || '') || (ev.notes || '') !== (b.notes || '') || (ev.startDate || b.date) !== b.date) {
          await tasks.setBrief(eventId, { on: true, title: ev.title || '', date: ev.startDate || b.date, notes: ev.notes || '' }).catch(() => null);
        }
      }
      items = await tasks.listBriefs();
      const out = [];
      for (const [eventId, b] of Object.entries(items)) {
        let n = await tasks.getNote(b.key).catch(() => null);
        const src = tasks.srcHash(b.title, b.notes);
        // 지문이 없는 예전 노트: 노트가 재료보다 나중이면 지금 재료를 기준점으로 기록
        if (n && !n.src && n.updatedAt >= (b.updatedAt || 0)) n = await tasks.stampNote(b.key, src).catch(() => n);
        const needsBriefing = !n || (n.src ? n.src !== src : n.updatedAt < (b.updatedAt || 0));
        out.push({ eventId, ...b, noteUpdatedAt: n?.updatedAt || null, needsBriefing, memoChanged: !!n && needsBriefing });
      }
      return { briefs: out.sort((a, b) => (a.date || '').localeCompare(b.date || '')) };
    },
  },
  {
    name: 'save_event_note',
    description: '일정 브리핑(마크다운)을 저장합니다. 앱에서 그 일정을 누르면 상세 창에 AI 카드로 보입니다. key 는 list_event_briefs 의 key.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, markdown: { type: 'string' }, title: { type: 'string', description: '일정 제목' } }, required: ['key', 'markdown'] },
    run: async (a) => {
      if (!/^ev-/.test(a.key || '')) throw new Error('key 는 ev- 로 시작해야 합니다 (list_event_briefs 참고).');
      const b = Object.values(await tasks.listBriefs()).find((x) => x.key === a.key);
      const src = b ? tasks.srcHash(b.title, b.notes) : undefined;
      return { saved: (await tasks.saveNote(a.key, { text: a.markdown, title: a.title || b?.title, src })).updatedAt };
    },
  },
  {
    name: 'get_note',
    description: '저장된 노트를 읽습니다. key: "briefing"(프로젝트 브리핑) · "daily"(일정 브리핑) · "prefs"(비서 학습 메모) · "task-<uid>"(할 일 노트) · 프로젝트 이름/태그(그 주제의 프로젝트 노트). 이전 조언을 이어받을 때 쓰세요.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    run: async (a) => ({ note: await tasks.getNote(a.key) }),
  },
  {
    name: 'save_research_note',
    description: '특정 프로젝트에 대한 진행 조언·다음 단계(마크다운)를 그 주제의 Research brief 에 저장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '주제 이름이나 태그' },
        markdown: { type: 'string' },
        url: { type: 'string', description: '이 대화의 claude.ai 주소 (알면)' },
      },
      required: ['topic', 'markdown'],
    },
    run: async (a) => ({ saved: (await tasks.saveNote(a.topic, { text: a.markdown, url: a.url })).updatedAt }),
  },
  {
    name: 'edit_categories',
    description: 'Tasks 카테고리를 편집합니다. op: add_area(name, color?, subs?) · add_sub(area, name) · rename_area(area, name) · rename_sub(area, sub, name) · remove_area(area) · remove_sub(area, sub) · set_color(area, color). 이름을 바꾸면 해당 할 일도 함께 바뀝니다.',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['add_area', 'add_sub', 'rename_area', 'rename_sub', 'remove_area', 'remove_sub', 'set_color'] },
        area: { type: 'string', description: '대상 상위 카테고리' },
        sub: { type: 'string', description: '대상 하위 카테고리' },
        name: { type: 'string', description: '새 이름' },
        color: { type: 'string', description: '#RRGGBB' },
        subs: { type: 'array', items: { type: 'string' }, description: 'add_area 때 하위 카테고리 목록' },
      },
      required: ['op'],
    },
    run: async ({ op, ...a }) => ({ categories: (await tasks.editCategories(op, a)).map((x) => ({ name: x.name, color: x.color, subs: x.tags })) }),
  },
);

function slim(e) {
  if (!e) return e;
  const o = {
    id: e.id, title: e.title, category: e.calendar, startDate: e.startDate, endDate: e.endDate,
    allDay: e.allDay,
  };
  if (!e.allDay) { o.startTime = e.startTime; o.endTime = e.endTime; }
  if (e.deadline) o.deadline = true;
  if (e.location) o.location = e.location;
  if (e.notes) o.notes = e.notes;
  if (e.alerts?.length) o.alerts = e.alerts;
  if (e.recurring) { o.recurrence = e.recurrence; o.occurrence = e.occurrence; }
  return o;
}

// Private features register tools without entering the public package.
for(let i=TOOLS.length-1;i>=0;i--) if(config.profile.omitTools?.includes(TOOLS[i].name)) TOOLS.splice(i,1);
for (const tool of config.profile.extraTools || []) {
  if (TOOLS.some(t => t.name === tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
  TOOLS.push(tool);
}
for (const tool of TOOLS) {
  const override = config.profile.toolOverrides?.[tool.name];
  if (override) Object.assign(tool, override);
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleOne(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg?.id ?? null, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined || msg.id === null;
  const { method, params = {} } = msg;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'my-calendar', title: config.appName, version: '1.0.0' },
          instructions: INSTRUCTIONS,
        };
        break;
      case 'ping': result = {}; break;
      case 'tools/list':
        result = { tools: TOOLS.map(({ run, ...t }) => t) };
        break;
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === params.name);
        if (!tool) return err(msg.id, -32602, `알 수 없는 도구: ${params.name}`);
        try {
          const out = await tool.run(params.arguments || {}, ctx);
          result = { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] };
        } catch (e) {
          result = { content: [{ type: 'text', text: `오류: ${e.message}` }], isError: true };
        }
        break;
      }
      case 'resources/list': result = { resources: [] }; break;
      case 'prompts/list': result = { prompts: [] }; break;
      default:
        if (method.startsWith('notifications/')) return null;
        return isNotification ? null : err(msg.id, -32601, `Method not found: ${method}`);
    }
    return isNotification ? null : ok(msg.id, result);
  } catch (e) {
    return isNotification ? null : err(msg.id, -32603, e.message);
  }
}

/** POST 본문(JSON-RPC) 처리 → { status, body } */
export async function handleMcp(payload, ctx = {}) {
  if (Array.isArray(payload)) {
    const out = (await Promise.all(payload.map((m) => handleOne(m, ctx)))).filter(Boolean);
    return out.length ? { status: 200, body: out } : { status: 202, body: null };
  }
  const out = await handleOne(payload, ctx);
  return out ? { status: 200, body: out } : { status: 202, body: null };
}

export const TOOL_NAMES = TOOLS.map((t) => t.name);
