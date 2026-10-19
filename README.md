# Sara — 개인 일정 비서 (v3.0.1)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fminkim1103%2Fvesper-office%2Ftree%2Fsara-stable&project-name=sara&repository-name=sara&env=ICLOUD_USERNAME%2CICLOUD_APP_PASSWORD%2CAPP_PASSWORD%2CMCP_TOKEN%2CASSISTANT%2CTIMEZONE&envDefaults=%7B%22ASSISTANT%22%3A%22chatgpt%22%2C%22TIMEZONE%22%3A%22Asia%2FSeoul%22%7D&envDescription=%EB%B3%B8%EC%9D%B8+iCloud+%EC%97%B0%EA%B2%B0+%EC%A0%95%EB%B3%B4%2C+%EC%9B%B9+%EB%A1%9C%EA%B7%B8%EC%9D%B8+%EC%95%94%ED%98%B8%2C+%EC%A7%81%EC%A0%91+%EC%83%9D%EC%84%B1%ED%95%9C+MCP+%ED%86%A0%ED%81%B0%EC%9D%84+%EC%9E%85%EB%A0%A5%ED%95%98%EC%84%B8%EC%9A%94.&envLink=https%3A%2F%2Fgithub.com%2Fminkim1103%2Fvesper-office%2Fblob%2Fsara-stable%2Fdocs%2FPERSONAL_SETUP.md)

각자 자신의 GitHub·Vercel·iCloud에 설치하는 개인 비서입니다. [처음 설치하기](docs/PERSONAL_SETUP.md) · [정식 버전 자동 업데이트](docs/AUTO_UPDATE.md)

Claude 또는 ChatGPT 한쪽에 연결해 일정과 업무를 관리하고, AI가 작성한 브리핑을 웹페이지에서 확인합니다. 앱은 AI API를 직접 호출하거나 예약을 실행하지 않습니다. 외부 AI의 예약 환경에서 MCP 읽기·쓰기가 가능한지는 실제 예약으로 확인해야 합니다.

## 화면과 기능

| 화면 | 기능 |
|---|---|
| Calendar | 월·목록 보기, 일정 검색, 일정 추가·수정·삭제, 반복 일정, 중요 일정, 종 버튼의 일정 브리핑 |
| Workstream | 프로젝트 카드, 진행률, 가까운 마감, 남은 태스크, 업무 브리핑과 프로젝트 노트 |
| Tasks | 업무·개인·집 분류, 마감 없는 할 일, 선택 알림, 태스크별 AI 노트 |

- iCloud 캘린더와 양방향 동기화하고, 선택적으로 Google Calendar도 연결합니다.
- 기본 언어는 한국어이며 설정에서 언어와 테마를 바꿀 수 있습니다.
- 연결할 AI는 배포 시 `ASSISTANT=claude` 또는 `ASSISTANT=chatgpt`로 정합니다. 앱 안의 테마 선택은 AI 계정 연결을 바꾸지 않습니다.
- 웹폰트는 서버에서 직접 제공하며 요청한 글꼴만 기기에 캐시합니다.
- 데이터는 각자의 iCloud에 저장됩니다. 별도 데이터베이스는 필요하지 않습니다. 데모의 메모리 데이터는 영구 저장되지 않습니다.

## 브리핑과 개인 맞춤

[기본 브리핑 지침](docs/BRIEFING_STYLE.md)은 `get_briefing`의 `briefingStyle`로 전달됩니다. 개인 스타일은 AI에게 요청하면 `save_briefing_style`로 본인의 iCloud에 저장합니다. 현재 명시적 요청 → 개인 설정 → 기본 지침 순서로 적용합니다.

외부 AI가 `get_briefing`으로 최신 자료를 읽고 일정 결과를 `save_daily_briefing({markdown})`, 업무 결과를 `save_briefing({markdown})`으로 저장합니다. 프로젝트별 상세 노트는 `save_research_note`를 사용합니다. 저장한 결과는 캘린더의 종 버튼과 Workstream에 표시됩니다. 화면이 열려 있으면 약 30초마다 확인하며 앱으로 돌아올 때도 다시 읽습니다.

일반 대화에서 성공한 것만으로 예약도 정시에 실행된다고 보장하지 않습니다. [설치 가이드](docs/PERSONAL_SETUP.md)의 수동·예약 테스트를 각각 진행하세요.

## 정식 배포와 자동 업데이트

- 공개 Sara의 `sara-v숫자.숫자.숫자` 정식 GitHub 릴리스만 업데이트 대상으로 받습니다. 초안·사전 릴리스·일반 개발 커밋·다른 앱 릴리스는 제외합니다.
- 이 저장소의 `main`은 개발용, `sara-stable`은 정식 배포용입니다. 배포 버튼도 `sara-stable`의 코드를 복사합니다.
- 설치자는 최초 한 번 [자동 업데이트 설정](docs/AUTO_UPDATE.md)을 완료하면 약 6시간마다 확인하고 자동 배포 요청을 보냅니다. GitHub 실행 지연이 있을 수 있습니다.
- 개인 계정·암호·토큰·일정·브리핑 취향은 교체하지 않습니다. 개인 코드 수정은 지원하지 않으며 관리 대상 코드는 정식 버전으로 교체됩니다.
- 다른 비공개 앱은 고정한 공통 엔진 버전을 독립적으로 채택합니다. Sara 릴리스가 다른 앱을 배포하지 않습니다.

## 저장 호환성

이름은 Sara이며 기존 설치의 저장 위치와 식별자는 유지합니다. 내부 저장 캘린더 기본 이름은 이전부터 사용한 `Vesper Office`입니다. 이름 변경만을 위해 이 캘린더를 바꾸거나 삭제하지 마세요. 기존에 다른 이름을 쓰고 있다면 `VESPER_CALENDAR`를 그 이름으로 유지합니다. 자동 데이터 이동은 없습니다.

## AI 연결

```text
https://본인-배포주소.vercel.app/mcp/<MCP_TOKEN>
```

URL에 토큰을 넣는 경우 No authentication을 선택하고 주소 전체를 비밀번호처럼 보관합니다. 요청 헤더를 지원하는 클라이언트는 `/mcp` 주소와 `Authorization: Bearer <MCP_TOKEN>`도 사용할 수 있습니다. OpenAI 또는 Anthropic API 키는 필요하지 않습니다.

선택적으로 Custom GPT Actions를 사용할 수 있습니다. `/api/actions/openapi.json`을 가져오고 API Key/Bearer 인증에 `MCP_TOKEN`을 등록합니다. Actions가 예약 환경에서도 사용된다는 의미는 아닙니다.

## 로컬 실행과 검증

Node 22를 권장하며 외부 npm 패키지가 필요하지 않습니다.

```sh
npm start
npm test
npm run release:check
```

환경변수가 없으면 데모 모드이며 로그인 암호는 `demo`입니다. 테스트 실행기는 실사용 클라우드 자격 증명을 제거한 뒤 데모 데이터로 검사합니다. Vercel 빌드에서도 같은 검사를 실행합니다.

[공통 엔진 관리](docs/SHARED_CORE.md) · [정식 릴리스 운영](docs/AUTO_UPDATE.md#관리자의-정식-릴리스)
