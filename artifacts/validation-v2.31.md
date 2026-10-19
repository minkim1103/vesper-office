# v2.31 변경 검증

- 설정 화면: 언어·테마만 표시. AI 전환·예약 버튼 제거.
- 일정·할 일 상세의 ChatGPT 예약 요청 제거. MCP 예약 요청 생성 도구 제거.
- AI 브랜드는 서버 ASSISTANT 설정을 사용. 기존 브라우저의 assistant 값은 무시.
- 기존 테스트 run/google/spaces/workstream/assistant 모두 통과.
- 실제 로컬 HTTP MCP save_daily_briefing으로 첫 결과를 저장하고 웹앱에서 확인. 창을 그대로 연 상태에서 두 번째 결과를 저장한 뒤, 수동 새로고침 없이 새 제목·내용이 표시됨을 확인.
- 비어 있는 Workstream 화면에서 MCP save_briefing으로 첫 결과를 저장한 뒤, 새 카드가 자동으로 나타남을 확인.
- 문법 검사와 git diff --check 통과.

검증 환경: 로컬 데모 저장소와 앱 내 브라우저. 외부 AI 대신 테스트 요청으로 저장 경로를 재현했으며 실제 ChatGPT/Claude 예약이나 개인 계정 연동을 실행한 것은 아닙니다. 자동 조회 주기는 화면이 보일 때 30초입니다.
