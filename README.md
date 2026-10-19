# Vesper — 개인 일정 비서 (v2.30)

아이폰 애플 캘린더(iCloud)와 양방향으로 동기화되는 개인 캘린더 겸 할 일 앱입니다. **Claude 또는 ChatGPT**와 연결해서 말로 일정과 할 일을 관리합니다.

```
 아이폰 캘린더 ⇄ iCloud ⇄ 이 서버(Vercel, 무료) ⇄ 웹앱 (홈 화면 앱)
                                          ⇅
                          Claude 또는 ChatGPT (MCP 커넥터)
```

데이터는 내 iCloud에만 저장됩니다. 서버에는 데이터베이스가 없습니다.

## 화면 구성 (좌우로 밀어서 이동)

| **Calendar** | Workstream | Tasks |
|---|---|---|
| 월 달력과 리스트. 날짜를 누르면 하루 패널이 열리고, 종 버튼에 일정 브리핑이 있습니다 | 프로젝트별 관리와 주간 타임라인. 맨 위에 프로젝트 브리핑 카드가 있습니다 | 카테고리별 할 일. 기본은 업무 › 회의·문서·보고·프로젝트, 개인, 집입니다 |

**주요 기능**
- **일정**: 추가·수정·삭제, 반복 일정, 중요 일정(D-day 강조, 아이폰 제목 앞 `[중요]`)
- **Tasks**: 할 일은 iCloud 'Vesper' 캘린더에 저장되고, 알람은 아이폰 기본 알림으로 울립니다. 카테고리는 AI에게 말로 바꿀 수 있습니다.
- **Workstream**: 프로젝트에 연결된 할 일은 아이폰 제목 앞에 `[태그]`가 붙습니다. 아이폰에서 제목 앞에 `[태그]`를 붙여도 그 프로젝트로 연결됩니다.
- **AI 노트**: 프로젝트 노트, 할 일별 노트(자료 조사 등), 일정 브리핑을 저장합니다.
  - 일정 편집에서 "✦ briefing"을 켜고 메모를 적어 두면, AI가 조사해서 일정 상세 창에 보여 줍니다.
  - 메모를 고치면 다시 조사합니다.
- **비서 학습 메모**: 브리핑 제안에 "좋다", "아니다"라고 하면 AI가 기억합니다.
- **(선택)** Google 캘린더 양방향 연결

## 설치

**`SETUP_GUIDE.md`를 Claude나 ChatGPT에게 주고 "구현 방법 알려줘"라고 하세요.** 한 단계씩 안내합니다.

## 언어 · 테마 · 예약

- 기본 언어는 한국어입니다. **캘린더 오른쪽 가로 세 줄 → 설정**에서 한국어 / English를 선택합니다.
- AI는 Claude / ChatGPT, 테마는 AI에 맞추기 / Claude / ChatGPT 중 고릅니다. AI와 테마를 서로 다르게 사용할 수 있습니다. 설정은 현재 브라우저에 저장됩니다.
- Claude는 기존 아이보리·클레이 색상, ChatGPT는 민트·딥 틸과 산세리프 제목을 사용합니다. 새 로고는 기존 달력 점과 별 모티프를 이어받은 Vesper 자체 디자인입니다. OpenAI 공식 로고가 아닙니다.
- 로그인 로고·파비콘·설치용 아이콘도 테마에 맞춥니다. 이미 설치된 홈 화면 아이콘은 기기에 따라 앱을 제거하고 다시 설치해야 갱신됩니다.
- 설정의 **ChatGPT 예약**에서 매일·매주 월요일 브리핑, 한 번 알림 요청을 만듭니다. 일정이나 마감이 있는 미완료 할 일에서도 알림 요청을 만들 수 있습니다. 선택한 날짜·시각 그대로 한 번 요청하며, 반복 일정의 전체 반복 규칙은 복사하지 않습니다.
- 요청을 확인한 뒤 ChatGPT에서 전송하고 실제 예약 완료와 다음 실행 시각을 확인해야 합니다. 앱은 ChatGPT 예약 생성·조회·수정·삭제를 직접 호출하지 않으며 양쪽 변경을 자동 동기화하지 않습니다. 기존 연결이 있는 대화를 쓰려면 **요청 복사**를 사용하세요.
- 예약 실행의 도구 지원은 계정과 환경에 따라 다릅니다. Vesper 커넥터를 실행 중 사용할 수 없다면 ChatGPT에 Google Calendar를 직접 연결하세요. iCloud 전용 일정·Vesper 할 일·노트는 Google Calendar에 자동 복제되지 않습니다.

공식 안내: [ChatGPT 예약](https://developers.openai.com/training/walkthroughs/scheduled-tasks), [GPT Actions 설정](https://developers.openai.com/api/docs/actions/getting-started).

## 예약 검증 현황

로컬 테스트에서 일정·업무 브리핑 저장과 모바일 크기 화면 표시를 확인했습니다. 실제 ChatGPT 예약의 정시 실행은 아직 검증하지 않았습니다. 일정 브리핑 자동 갱신과 업무 예약의 저장 지시에는 확인된 문제가 있습니다. 상세 결과와 테스트 화면은 [예약 검증 보고서](artifacts/schedule-test/REPORT.md)를 참고하세요.

## Custom GPT Actions (선택)

기존 MCP 연결 외에 브리핑 조회·저장용 Actions도 제공합니다.

1. 배포한 앱의 `https://<내 도메인>/api/actions/openapi.json`을 Custom GPT의 Actions에서 가져옵니다.
2. 인증은 **API Key → Bearer**로 선택하고 서버의 `MCP_TOKEN` 값을 비밀 설정에 입력합니다. 스키마·프롬프트·GitHub에는 토큰을 넣지 않습니다.
3. `get_current_briefing`으로 오늘 일정, 겹치는 약속, 마감, 할 일과 프로젝트 맥락을 읽습니다.
4. `save_daily_briefing`으로 `markdown`을 저장하면 앱의 종 버튼에 반영됩니다. 이 쓰기는 사용자 확인을 요구하도록 선언되어 있습니다.
5. 우선 대화에서 수동으로 테스트하세요. Custom GPT Actions가 예약 실행에서도 사용된다고 보장하지 않습니다. 예약 실행에는 해당 ChatGPT 환경이 지원하는 연결 방식이 필요합니다.

OpenAI API 키나 Claude API 키는 필요하지 않습니다. 사용자가 각 AI 서비스에 앱을 연결하는 구조입니다.

## GitHub 공개 준비

소스 공개와 내 일정 데이터 공개는 다릅니다. 이 앱은 한 사람용 서버이므로 배포 시 강한 `APP_PASSWORD`와 `MCP_TOKEN`을 설정하세요. iCloud가 연결된 상태에서 `APP_PASSWORD`가 비어 있으면 웹 로그인을 허용하지 않습니다. `.env`와 `.env.*`는 제외되고 `.env.example`만 포함됩니다. 계정·앱 암호·토큰·개인 일정 백업은 커밋하지 마세요. 이미 Git 이력에 포함된 값은 ignore 규칙으로 제거되지 않으므로 삭제와 자격 증명 교체가 필요합니다.

## 직접 실행 / 테스트

Node 20 이상이 필요하고, 외부 패키지는 없습니다.

```bash
npm start   # http://localhost:3000 — 환경변수가 없으면 데모 모드(비밀번호 demo)
npm test
```

## 파일 구조

```
api/index.js      Vercel 서버 진입점
src/config.js     환경변수 설정
src/caldav.js     iCloud CalDAV 통신
src/ical.js       iCalendar 읽기/쓰기, 반복 일정 계산
src/service.js    일정 로직 (웹앱·AI 공용), 브리핑 데이터
src/tasks.js      Tasks · Workstream · AI 노트 · 일정 브리핑 (iCloud 'Vesper' 캘린더에 저장)
src/google.js     Google 캘린더 (선택)
src/mcp.js        AI 연결 (MCP 도구, Claude·ChatGPT 공용)
src/handler.js    API 라우터 / 로그인
src/demo.js       데모 모드용 메모리 저장소
public/           웹앱 (index.html, app.js, styles.css, sw.js, 아이콘)
dev.js            로컬 실행 서버
test/             테스트
```
