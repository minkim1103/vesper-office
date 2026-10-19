# 나만의 Sara 설치하기

한 사람당 자신의 Vercel 프로젝트, iCloud 계정, APP_PASSWORD, MCP_TOKEN을 사용합니다. 다른 사람의 배포 주소에 계정을 등록하는 방식이 아닙니다. 설치는 대략 20~40분으로 예상하며 계정 생성과 AI 연결 상태에 따라 더 걸릴 수 있습니다.

## 1. Apple 앱 전용 암호 준비

1. Apple 계정의 이중 인증을 켜고 iCloud 캘린더 동기화를 활성화합니다.
2. https://account.apple.com 에 로그인합니다.
3. **로그인 및 보안 → 앱 암호 → 앱 암호 생성**을 선택합니다. 이름은 Sara로 정합니다.
4. 생성된 앱 암호는 Vercel의 ICLOUD_APP_PASSWORD에 직접 입력합니다. 일반 Apple 계정 비밀번호가 아닙니다.

앱 암호 메뉴가 보이지 않으면 이중 인증과 계정 지원 여부를 확인하세요. 일반 Apple 비밀번호를 변경하면 기존 앱 암호도 취소되므로 새로 만들어 재배포해야 합니다.

공식 안내: https://support.apple.com/en-us/102654

## 2. MCP 토큰과 웹 로그인 암호 만들기

MCP_TOKEN은 OpenAI나 Anthropic에서 발급받는 키가 아닙니다. 자신의 Sara 서버 접속용으로 직접 만드는 무작위 비밀 문자열입니다.

- 비밀번호 관리자로 64자 무작위 영문·숫자 문자열을 생성하거나, Mac 터미널에서 아래 명령을 실행합니다.

```sh
openssl rand -hex 32
```

출력된 64자리 문자열을 MCP_TOKEN에 넣습니다. 이 명령은 로컬에서 새 무작위 값을 만들며 어디에 신청하지 않습니다. APP_PASSWORD는 이것과 다른 긴 암호로 만듭니다. 앱 암호·토큰·웹 암호는 공개 저장소나 채팅에 넣지 않습니다.

## 3. 자기 계정으로 배포

GitHub와 Vercel 계정을 준비한 뒤 README의 Deploy with Vercel 버튼을 누릅니다. 공개 Sara의 정식 브랜치(`sara-stable`)를 본인 GitHub에 복사하고 본인 Vercel 프로젝트로 배포합니다. 프로젝트 이름은 Sara입니다. 자신의 계정과 맞는 무료 Hobby 범위에서 개인용으로 사용합니다.

배포 화면에서 다음 값을 입력합니다.

| 환경변수 | 입력할 것 |
|---|---|
| ICLOUD_USERNAME | iCloud 캘린더를 사용하는 Apple 계정 이메일 |
| ICLOUD_APP_PASSWORD | 1단계의 Apple 앱 전용 암호 |
| APP_PASSWORD | 본인이 정한 웹 로그인 암호 |
| MCP_TOKEN | 2단계에서 생성한 무작위 문자열 |
| ASSISTANT | claude 또는 chatgpt 중 실제 연결할 하나 |
| TIMEZONE | 한국이면 Asia/Seoul |

Framework는 Other, 출력 폴더는 public입니다. 출력 폴더는 vercel.json에 지정되어 있습니다. 배포 후 받은 자기 주소로 접속해 APP_PASSWORD로 로그인합니다. 환경변수를 변경했다면 다시 배포해야 합니다.

데모 표시가 사라지고 일정이 조회되는지 확인합니다. 테스트 프로젝트를 하나 만들고 새로고침해도 남는지 확인하세요. iCloud 연결 시 Vesper Office 캘린더가 생성되고 프로젝트·할 일·노트가 저장됩니다. 데모의 메모리 데이터는 자동 이전되지 않습니다.

권장 설치 방법은 README의 Deploy 버튼입니다. 수동 Fork를 사용한다면 처음에는 `sara-stable`의 정식 버전으로 맞추고, 본인 Vercel의 Add New / Project에서 복사본을 Import한 뒤 같은 환경변수를 입력해 Deploy합니다. 일반 복사본은 자동으로 갱신되지 않습니다. 설치 후 [정식 버전 자동 업데이트](AUTO_UPDATE.md)를 설정하면 이후 정식 릴리스만 자동으로 가져와 재배포합니다.

## 4. Claude 또는 ChatGPT 한쪽에 연결

연결 주소는 자신의 배포 주소를 사용합니다.

```text
https://자기-배포주소.vercel.app/mcp
```

클라이언트가 Request headers를 지원하면 `Authorization: Bearer <MCP_TOKEN>`을 설정합니다. 이 서버는 OAuth 로그인 서버를 제공하지 않습니다. URL에 토큰을 넣는 방식이 필요한 클라이언트에서는 아래 주소와 No authentication / No sign in을 사용합니다. 해당 URL 전체를 비밀번호처럼 보관하세요.

```text
https://자기-배포주소.vercel.app/mcp/<MCP_TOKEN>
```

- Claude: Customize → Connectors → Add custom connector에서 자신의 주소와 인증 방식을 설정합니다.
- ChatGPT: 현재 계정의 커스텀 MCP/플러그인 연결 화면에서 자신의 주소를 연결하고 읽기·쓰기 도구를 확인합니다. 메뉴와 지원 범위는 플랜·워크스페이스에 따라 다릅니다. 기존 SETUP_GUIDE의 Developer Mode 메뉴가 계정에 없을 수도 있습니다.
- 둘 다 등록할 필요는 없습니다. 선택한 서비스 한쪽만 사용합니다. 일반 대화에서 “오늘 일정 확인해줘”, “테스트 할 일 추가해줘”를 실행하고 웹사이트에서 확인합니다.

공식 안내:
- Claude: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- ChatGPT: https://developers.openai.com/api/docs/guides/custom-mcp-server

## 5. 기본 브리핑과 개인 맞춤

기본 뼈대는 BRIEFING_STYLE.md에 있으며, get_briefing 응답의 briefingStyle로 AI에 전달됩니다. GitHub를 매번 직접 찾아 읽을 필요가 없습니다. 기본 가이드의 예시 일정은 실제 데이터가 아닙니다.

연결한 AI에게 예를 들어 이렇게 말합니다.

> 내 브리핑은 존댓말로 5줄 정도, 제안은 1개만 해줘. 업무 일정 위주로 쓰고 이 스타일을 기억해줘.

AI는 get_briefing_style로 기존 개인 지시를 읽고 요청한 부분을 수정한 뒤 save_briefing_style로 전체 개인 지시를 저장합니다. 다른 선호는 보존합니다. 개인 설정은 해당 배포의 iCloud에만 저장됩니다. 데모에서는 영구 저장되지 않습니다.

우선순위: 현재 사용자의 명시적 요청 → 저장된 개인 지시 → 기본 가이드. 사실을 지어내지 않기와 일정·할 일을 임의 변경하지 않기는 유지합니다. 초기화는 “개인 브리핑 스타일을 기본값으로 되돌려줘”라고 요청합니다. 도구에서는 markdown 빈 문자열로 초기화합니다.

“이 제안은 좋았어/주말에는 일 제안하지 마” 같은 피드백은 비서 학습 메모(prefs)를 읽고 반영하도록 안내되어 있습니다. AI가 실제 저장 도구를 호출했는지 확인하세요.

## 6. 외부 예약 만들기

AI 서비스에서 다음 내용으로 예약을 만듭니다. Sara 앱 안에서는 예약을 생성하지 않습니다.

```text
매일 오전 7시 50분, Asia/Seoul 기준으로 브리핑해줘.
매 실행 때 Sara get_briefing을 호출하고 briefingStyle의 기본 가이드·개인 지시·피드백과 horizon의 최신 일정과 planningTasks의 2주 내 마감 자료를 읽어줘.
현재 요청과 개인 지시를 기본 가이드보다 우선하고, 이전 daily 노트를 읽어 같은 제안을 반복하지 마.
일정·할 일은 수정하지 말고, 사실과 제안을 구분해 작성해줘.
일정 브리핑 전문을 save_daily_briefing으로 저장해줘.
업무 브리핑이 필요하면 업무 내용만 별도로 작성해 save_briefing에 저장해줘.
도구에 접근할 수 없거나 저장에 실패하면 성공한 것처럼 말하지 말고 실패 이유를 알려줘.
실제 예약 등록과 다음 실행 시각을 확인해줘.
```

예약 작업이 해당 연결의 읽기·쓰기를 실제로 사용할 수 있어야 합니다. 일반 대화에서 한 번 수동 실행한 뒤 예약을 테스트하고, 웹사이트의 종 버튼과 Workstream에 저장됐는지 확인합니다. 연결 제약이나 권한 확인 때문에 예약이 멈추는 환경에서는 프롬프트만으로 해결되지 않습니다.

최종 브리핑은 마크다운으로 저장하고 웹페이지가 표시합니다. 앱은 AI API를 직접 호출하지 않습니다. 화면이 보일 때 약 30초마다 새 노트를 확인하며, 휴대폰에서 앱으로 돌아올 때도 다시 읽습니다. 실제 정시 실행·알림 전달은 외부 예약 환경에서 검증해야 합니다.

## 7. 선택: Google Calendar 연결

현재 Sara의 프로젝트·할 일·노트 저장은 iCloud를 사용합니다. Google Calendar 연결은 일정 동기화를 추가하는 선택 기능입니다.

1. 본인 Google Cloud 프로젝트에서 Google Calendar API와 OAuth 동의 화면을 설정합니다.
2. 웹 애플리케이션 OAuth 클라이언트를 만들고 리디렉션 URI를 `https://본인주소/api/google/callback`으로 등록합니다.
3. Vercel에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 저장하고 재배포합니다.
4. Sara의 캘린더 메뉴에서 Google 연결을 실행합니다. 계정과 요청 권한을 확인합니다.
5. 연결 완료 화면의 토큰을 Vercel의 `GOOGLE_REFRESH_TOKEN`에 저장한 뒤 재배포합니다.

Google의 앱 검증·게시 상태에 따라 계정 제한이나 토큰 유효기간이 달라질 수 있습니다. 토큰은 코드나 채팅에 붙여넣지 않습니다.
