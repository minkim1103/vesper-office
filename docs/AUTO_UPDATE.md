# Sara 정식 버전 자동 업데이트

각자 서버를 유지하면서 공개 Sara의 정식 릴리스만 자동으로 받습니다. 개발 커밋, 초안, 사전 릴리스와 다른 앱의 버전은 설치하지 않습니다. 최초 한 번 아래 설정이 필요합니다.

## 설치자가 한 번 할 일

1. README의 **Deploy with Vercel**로 Sara를 설치합니다. 버튼은 정식 브랜치 `sara-stable`을 복사합니다. 본인 GitHub에 만든 저장소와 Vercel 프로젝트가 연결되어 있어야 합니다.
2. Vercel 프로젝트의 **Settings → Environments → Production**에서 Production Branch를 확인합니다. 다음 단계의 Hook도 이 브랜치와 같아야 합니다. 보통 복사본의 기본 브랜치 `main`입니다.
3. Vercel 프로젝트의 **Settings → Git → Deploy Hooks**에서 이름 `Sara stable updates`, 브랜치는 위 Production Branch로 지정하고 Hook을 만듭니다.
4. 본인 GitHub 저장소의 **Settings → Secrets and variables → Actions → Secrets → New repository secret**에서 이름 `SARA_DEPLOY_HOOK`, 값은 방금 만든 Hook URL로 저장합니다. 이 URL은 배포 권한이 있으므로 공개하지 않습니다. iCloud 암호·MCP 토큰·Vercel 전체 계정 토큰은 GitHub에 옮길 필요가 없습니다.
5. 같은 화면의 **Variables → New repository variable**에 이름 `SARA_AUTO_UPDATE`, 값 `true`를 저장합니다. 배포 Hook 설정이 끝난 뒤 활성화합니다.
6. 저장소의 **Actions**에서 사용 허용 화면이 나오면 활성화합니다. Fork는 워크플로가 기본적으로 꺼져 있을 수 있습니다.
7. **Sara automatic updates → Run workflow**를 한 번 실행합니다. 기본 브랜치를 선택합니다. 성공 후 Vercel에서도 새 배포가 **Ready**인지 확인합니다. 초기에 이미 최신 버전이어도 설치 상태를 기록하고 한 번 배포 요청을 보냅니다.

이후 약 6시간마다 새 정식 버전을 확인합니다. GitHub의 예약 실행은 지연될 수 있습니다. 즉시 받고 싶으면 같은 Run workflow를 사용합니다. 비활성화는 `SARA_AUTO_UPDATE`를 `false`로 바꾸면 됩니다.

GitHub 조직 정책이 쓰기 토큰을 제한하거나 기본 브랜치가 보호되어 있으면 업데이트 커밋의 push가 실패할 수 있습니다. 개인 설치용 저장소에서 사용하고, 실패 시 Actions 로그를 확인하세요. 공개 저장소는 60일간 활동이 없으면 예약 워크플로가 중지될 수 있으므로 Actions에서 다시 활성화해야 합니다. 개인 설치 복사본은 비공개로 만드는 것을 권장합니다.

## 바뀌는 것과 유지되는 것

- 공개 릴리스에서 `api/`, `src/`, `public/`, `scripts/`, `test/`, `docs/`와 지정한 루트 설정 파일을 가져옵니다. 더 이상 존재하지 않는 관리 대상 파일도 정리합니다.
- `.github/`의 초기 설치 워크플로는 자동 교체하지 않습니다. GitHub 기본 토큰으로 워크플로 수정이 제한되기 때문입니다. 초기 워크플로를 변경해야 하는 버전은 별도 설치 안내를 제공합니다.
- Vercel 환경변수, GitHub Secrets/Variables, `.env`, 설치별 파일, iCloud 일정·할 일·브리핑 스타일은 덮어쓰지 않습니다. 관리 대상 코드의 개인 수정은 새 정식 버전으로 교체됩니다.
- 이 저장소 이름과 패키지 이름, 내부 저장 캘린더 `Vesper Office`는 기존 연결 호환성을 위해 유지합니다. 화면과 제품 이름은 **Sara**입니다. 내부 캘린더 이름을 바꾸거나 데이터를 이동하지 않습니다.
- 사용자 저장소에는 봇이 업데이트 커밋을 만들며 강제 push하지 않습니다. 테스트 실패나 충돌 시 push와 배포 요청을 중단합니다. 개인 자격 증명 대신 데모 데이터로 테스트합니다.
- 배포 Hook 요청 실패는 다음 실행에서 재시도합니다. Hook 접수 성공은 빌드 성공을 의미하지 않습니다. Vercel에서 Error가 나면 로그를 확인하고 수정 후 Redeploy하세요. 실패한 배포는 기존 정상 배포를 대체하지 않습니다.

## 관리자의 정식 릴리스

공개 저장소 `minkim1103/vesper-office`에서만 발행할 수 있습니다. 다른 비공개 앱 저장소는 읽거나 배포하지 않습니다.

1. `main`에서 변경하고 테스트합니다.
2. `package.json`, `sara-release.json`, `public/app.js`의 VERSION, `public/sw.js`의 캐시 버전을 같은 새 버전으로 맞춥니다.
3. `npm test`와 `npm run release:check`를 실행하고 `main`에 push합니다. 정식 배포 전에는 Preview로 검증할 수 있습니다.
4. GitHub **Actions → Publish Sara stable release → Run workflow**에서 `main`과 버전(예: `3.0.2`)을 선택합니다.
5. 검증에 성공하면 `sara-v3.0.2` 정식 릴리스가 생기고 `sara-stable` 브랜치가 해당 커밋으로 전진합니다. 같은 버전은 재발행하지 않습니다.
6. 원본 Vercel 프로젝트는 Production Branch를 `sara-stable`로 지정합니다. `main` 커밋을 Production으로 잘못 요청해도 Ignored Build Step이 건너뜁니다. `sara-stable`은 릴리스 워크플로로만 갱신하세요.

원본의 `main` push만으로 설치자에게 전달되지 않습니다. 설치자는 공개 정식 릴리스의 태그를 조회하고, 버전·제품·저장소 메타데이터가 모두 일치하는지 검증한 뒤 코드와 테스트를 설치합니다. 이미 설치한 태그가 다른 커밋을 가리키면 거부합니다. 자동 다운그레이드는 하지 않습니다. 되돌림은 수정한 코드를 더 높은 버전의 새 정식 릴리스로 발행하는 방식으로 진행합니다.

## 검증 범위

`test/release.js`는 정식 릴리스 필터, 숫자 버전 순서, 다른 앱 거부, 원본 Production 브랜치 제한, 파일 교체·삭제, 설치 비밀 파일 및 워크플로 보존, 변경 중인 작업 트리 거부, Hook 실패 처리를 검사합니다. 실제 다른 계정의 최초 설치에서는 위 7번과 Vercel Ready 상태까지 확인하세요.

공식 자료: [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks), [GitHub 예약 워크플로 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
