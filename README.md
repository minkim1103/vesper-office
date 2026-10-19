# Vesper Office — 개인 일정 비서 (v3.0.0)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fminkim1103%2Fvesper-office&project-name=vesper-office&repository-name=vesper-office&env=ICLOUD_USERNAME%2CICLOUD_APP_PASSWORD%2CAPP_PASSWORD%2CMCP_TOKEN%2CASSISTANT%2CTIMEZONE&envDefaults=%7B%22ASSISTANT%22%3A%22chatgpt%22%2C%22TIMEZONE%22%3A%22Asia%2FSeoul%22%7D&envDescription=%EA%B0%9C%EC%9D%B8+iCloud+%EC%97%B0%EA%B2%B0+%EC%A0%95%EB%B3%B4%EC%99%80+%EC%9B%B9+%EB%A1%9C%EA%B7%B8%EC%9D%B8+%EC%95%94%ED%98%B8%2C+%EC%A7%81%EC%A0%91+%EC%83%9D%EC%84%B1%ED%95%9C+MCP+%ED%86%A0%ED%81%B0%EC%9D%84+%EC%9E%85%EB%A0%A5%ED%95%98%EC%84%B8%EC%9A%94.&envLink=https%3A%2F%2Fgithub.com%2Fminkim1103%2Fvesper-office%2Fblob%2Fmain%2Fdocs%2FPERSONAL_SETUP.md)

각자 자신의 GitHub·Vercel·iCloud로 설치합니다. [개인 설치 가이드](docs/PERSONAL_SETUP.md)에 앱 암호와 MCP 토큰 생성부터 AI 연결까지 정리되어 있습니다.


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
| 월 달력과 리스트. 날짜를 누르면 하루 패널이 열리고, 종 버튼에 일정 브리핑이 있습니다 | 프로젝트 카드에서 진행률·가까운 마감·남은 할 일을 확인하고 바로 완료하거나 추가합니다. 맨 위에는 프로젝트 브리핑이 있습니다 | 카테고리별 할 일. 기본은 업무 › 회의·문서·보고·프로젝트, 개인, 집입니다 |

**주요 기능**
- **일정**: 추가·수정·삭제, 반복 일정, 중요 일정(D-day 강조, 아이폰 제목 앞 `[중요]`)
- **Tasks**: 할 일은 iCloud 'Vesper Office' 캘린더에 저장되고, 알람은 아이폰 기본 알림으로 울립니다. 카테고리는 AI에게 말로 바꿀 수 있습니다.
- **Workstream**: 프로젝트에 연결된 할 일은 아이폰 제목 앞에 `[태그]`가 붙습니다. 아이폰에서 제목 앞에 `[태그]`를 붙여도 그 프로젝트로 연결됩니다.
- **AI 노트**: 프로젝트 노트, 할 일별 노트(자료 조사 등), 일정 브리핑을 저장합니다.
  - 일정 편집에서 "✦ briefing"을 켜고 메모를 적어 두면, AI가 조사해서 일정 상세 창에 보여 줍니다.
  - 메모를 고치면 다시 조사합니다.
- **비서 학습 메모**: 브리핑 제안에 "좋다", "아니다"라고 하면 AI가 기억합니다.
- **(선택)** Google 캘린더 양방향 연결

## 설치

**`SETUP_GUIDE.md`를 Claude나 ChatGPT에게 주고 "구현 방법 알려줘"라고 하세요.** 한 단계씩 안내합니다.

## 언어 · 테마 · 외부 AI 브리핑

- 기본 언어는 한국어입니다. **캘린더 오른쪽 가로 세 줄 → 설정**에서 언어와 테마를 선택합니다.
- 연결할 AI는 배포 시 환경변수 `ASSISTANT=claude` 또는 `ASSISTANT=chatgpt`로 고정합니다. 앱에 AI 전환·예약 버튼은 없습니다. 이전 브라우저의 AI 선택값은 사용하지 않습니다.
- Claude 또는 ChatGPT 한쪽에 Vesper MCP를 연결하고, 해당 서비스에서 브리핑 예약을 관리합니다. 앱 서버가 예약을 생성하거나 AI API를 직접 실행하지 않습니다.
- 외부 작업은 매번 `get_briefing`으로 최신 자료를 읽고, 일정 결과는 `save_daily_briefing({markdown})`, 업무 결과는 `save_briefing({markdown})`으로 저장합니다. 특정 프로젝트의 상세 내용은 `save_research_note`로 저장합니다.
- 저장된 마크다운은 일정 화면의 종 버튼과 Workstream 카드에서 표시됩니다. 화면이 보이면 30초마다 새 결과를 확인하고, 앱으로 돌아오거나 종 버튼을 누르면 다시 조회합니다.
- 테마는 AI에 맞추기 / Claude / ChatGPT 중 선택할 수 있습니다. 테마 변경은 연결된 AI를 바꾸지 않습니다.
- 실제 외부 예약에서 MCP 읽기·쓰기가 가능한지는 계정·실행 환경에서 확인해야 합니다. 연결 없이 대화에만 작성한 결과는 웹사이트에 자동 저장되지 않습니다.

## 예약 검증 현황

초기 버전의 [검증 보고서](artifacts/schedule-test/REPORT.md)는 변경 전 기록입니다. v2.31에서 앱 내부 예약 기능을 제거하고 일정·업무 브리핑의 갱신 경로를 수정했습니다. 실제 ChatGPT·Claude 예약의 정시 실행은 별도 운영 검증이 필요합니다.

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
src/tasks.js      Tasks · Workstream · AI 노트 · 일정 브리핑 (iCloud 'Vesper Office' 캘린더에 저장)
src/google.js     Google 캘린더 (선택)
src/mcp.js        AI 연결 (MCP 도구, Claude·ChatGPT 공용)
src/handler.js    API 라우터 / 로그인
src/demo.js       데모 모드용 메모리 저장소
public/           웹앱 (index.html, app.js, styles.css, sw.js, 아이콘)
dev.js            로컬 실행 서버
test/             테스트
```

## v2.32 저장·편집 개선

- 일정의 브리핑 선택은 AI 이름 없이 **브리핑**으로 표시합니다. 연결된 Claude 또는 ChatGPT가 같은 요청을 처리합니다.
- 프로젝트에서 할 일을 저장하거나 취소하면 프로젝트 상세로 돌아갑니다. 마감은 선택 사항이며, 기존 마감 날짜·시각도 지울 수 있습니다.
- 데모는 프로세스 메모리 저장이므로 재시작 또는 Vercel 인스턴스 교체 시 사라질 수 있습니다. iCloud 연결 시 프로젝트 설정·할 일·노트는 iCloud의 Vesper Office 캘린더에 저장됩니다. 실제 계정 연결 후 저장·재조회 검증을 진행하세요.

## 기본 브리핑과 개인 맞춤

[기본 가이드](docs/BRIEFING_STYLE.md)는 모든 사용자에게 공통으로 제공됩니다. `get_briefing`과 `get_briefing_style`이 기본 가이드·개인 지시·피드백을 전달합니다. 사용자가 스타일을 바꾸라고 요청하면 AI가 `save_briefing_style`로 본인의 iCloud에만 저장합니다. 현재 명시적 요청 → 개인 지시 → 기본 가이드 순서이며, 기본 가이드는 변경하지 않습니다. 실제 문장 생성은 연결된 AI가 수행합니다.

## 공통 엔진과 앱별 배포

이 공개 저장소는 Office 앱과 `@vesper/core` 공통 엔진을 함께 제공합니다. 다른 앱은 Git 커밋으로 엔진 버전을 고정하고, 자체 프로필·UI·전용 기능을 별도 저장소에 유지할 수 있습니다. 이 저장소에는 다른 앱의 개인 지침이나 전용 모듈을 포함하지 않습니다. [관리 가이드](docs/SHARED_CORE.md)를 참고하세요.

새 Office의 내부 저장 캘린더 기본값은 `Vesper Office`입니다. 이미 다른 이름으로 운영 중인 설치는 `VESPER_CALENDAR`를 기존 이름으로 명시해 유지하세요. 저장 데이터의 자동 이동은 하지 않습니다.
