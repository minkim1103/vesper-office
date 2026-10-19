# Vesper 작업 이어받기 — v2.31

- 공개 저장소: https://github.com/minkim1103/vesper-office
- 배포: https://vesper-office-gold.vercel.app/
- 사용자 한 명이 Claude 또는 ChatGPT 한쪽을 연결해 비서로 사용합니다.
- `ASSISTANT=claude|chatgpt`로 서버의 AI를 고정합니다. 브라우저의 예전 AI 선택값은 사용하지 않습니다.
- 설정에는 언어와 테마만 있습니다. 앱 내부 예약·알림 요청 UI와 `prepare_chatgpt_schedule` 도구는 제거했습니다.
- 예약은 외부 AI 서비스에서 관리합니다. `get_briefing` → AI가 마크다운 생성 → 일정 `save_daily_briefing` / 업무 `save_briefing` / 프로젝트 상세 `save_research_note` → 웹사이트 표시.
- 표시 중 30초마다 일정과 현재 Workstream 브리핑을 조회합니다. 첫 노트 도착, 휴대폰 복귀, 종 버튼 클릭도 갱신합니다.
- 기본 언어 한국어, English 선택 가능. 사용자 작성 내용은 번역하지 않습니다. 버튼에 불필요한 설명 문구를 추가하지 않습니다.
- 앱 서버는 AI API 호출이나 예약 실행을 하지 않습니다. 실제 예약 환경의 도구 접근·정시 실행은 계정으로 별도 검증해야 합니다.
- 실제 계정 자격 증명은 포함하지 않습니다. 데모 데이터는 메모리 저장입니다. 로컬 `.env`는 자동 로드하지 않습니다.
- 실행: Node 20+에서 `node dev.js`. 테스트: `npm test`. 선택 브라우저 통합 테스트: Playwright를 별도 설치한 환경에서 `node test/schedule-e2e.mjs`.
