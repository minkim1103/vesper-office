# Vesper 작업 이어받기

이 폴더를 맥북의 Codex에서 열고 이 파일을 먼저 읽으면 됩니다.

## 사용자 요청

- Claude 또는 ChatGPT와 연결하는 개인 일정·할 일 비서 웹앱입니다.
- GitHub 공개를 준비 중입니다. 아직 업로드하거나 배포하지 않았습니다.
- 기존 앱의 간결한 느낌을 유지하고, 버튼에 설명 문구를 덧붙이지 않습니다.
- 기본 언어는 한국어이며 설정에서 English로 바꿀 수 있어야 합니다.
- 기존 캘린더 화면 오른쪽 가로 세 줄 → 캘린더 선택창 안의 설정 버튼으로 진입합니다.
- AI 선택(Claude/ChatGPT)과 테마 선택(AI에 맞추기/Claude/ChatGPT)은 독립적입니다.

## 반영된 내용

- public/i18n.js: 한국어/영어 UI와 날짜 표시. 사용자 작성 제목·메모는 번역하지 않습니다.
- public/app.js, styles.css, index.html: 설정 화면, 기기별 설정 저장, GPT 테마(딥 틸·민트, 산세리프 제목).
- public/icons/chatgpt-*: 기존 달력 점·별 모티프를 살린 새 SVG 로고와 설치용 PNG 아이콘.
- public/assistant.js: 매일·매주 월요일 브리핑과 한 번 알림 요청 생성.
- 일정 상세 및 마감이 있는 미완료 할 일에서 ChatGPT 알림 요청 가능.
- src/mcp.js: prepare_chatgpt_schedule 도구 추가. 예약 요청 문구만 반환합니다.
- src/actions.js, handler.js: Custom GPT Actions용 OpenAPI 스키마와 Bearer 인증 브리핑 조회·저장 API.
- src/branding.js: 기본 브랜딩과 설치용 manifest 응답.
- src/auth.js: APP_PASSWORD가 비어 있으면 로그인과 세션 인증을 허용하지 않도록 수정.
- .gitignore: 실제 .env 변형을 제외하고 .env.example만 허용.
- README.md, SETUP_GUIDE.md에 설치·연결·예약 기능 범위 기록.

## 예약 기능 범위

앱이 ChatGPT의 예약 작업을 직접 생성하거나 양방향 동기화하지는 않습니다. 요청을 미리 확인하고 복사하거나 ChatGPT로 전달한 뒤 사용자가 실제 예약을 확정하는 방식입니다. 예약 실행 중 Vesper 연결 도구 사용 가능 여부는 계정과 실행 환경에 따라 달라집니다. Google Calendar 직접 연결 경로도 선택할 수 있습니다. iCloud 전용 일정·Vesper 할 일·노트가 Google Calendar에 자동 복제되지는 않습니다.

실제 AI 계정이나 iCloud 자격 증명으로 연결한 운영 테스트는 수행하지 않았습니다. 서버에서 ASSISTANT를 바꿔도 외부 AI 서비스의 커넥터 설정은 별도로 필요합니다.

## 실행·검증

Node.js 20 이상. 외부 npm 패키지 의존성은 없습니다.

```sh
node dev.js
# http://localhost:3000 — 환경변수가 없으면 데모, 비밀번호 demo
npm test
```

Windows에서 기존 일정·Google 캘린더·할 일·프로젝트 테스트와 새 assistant 테스트가 통과했습니다. 브라우저에서 한국어/영어 전환, 설정 유지, AI·테마 독립 선택, GPT 자동 테마, 예약 요청 미리보기와 전달 링크를 확인했습니다. 실제 예약 실행은 배포 후 본인 계정으로 확인해야 합니다.

인증 정보는 이 묶음에 포함하지 않았습니다. 로컬 실행 시 .env 파일은 자동 로드되지 않습니다. 실제 연결은 프로세스 환경변수나 배포 서비스의 비밀 설정에 입력하세요.
