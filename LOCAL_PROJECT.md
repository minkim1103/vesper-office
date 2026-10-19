# Vesper Office 로컬 프로젝트

2026-10-19 Google Drive의 `vesper-mac-transfer.zip`을 내려받아 원본 코드 42개 파일을 복원했습니다.

## 작업 방향

- iCloud / Google Calendar 일정 조회·추가·수정
- Claude / ChatGPT를 통한 해당 날짜 브리핑과 예약 요청
- Workstream 업무 맥락을 활용한 상세 브리핑
- GitHub 공개 저장소와 개인 Vercel 배포, 개인 자격 증명으로 계정 연결

## 현재 상태

- 원본 소스는 수정하지 않았으며 로컬 Git 저장소의 기본 브랜치는 `main`입니다.
- 원본 ZIP은 상위 `downloads/vesper-mac-transfer.zip`에 보관했습니다.
- 실제 자격 증명은 포함되어 있지 않습니다. `.env.example`은 설정 견본입니다.
- 실행 방법: Node.js 20 이상에서 `node dev.js`. 상세 연결 절차는 `SETUP_GUIDE.md`를 참고하세요.
- AI 예약은 현재 요청 문구를 만들어 전달하는 방식입니다. 상세 구현 범위는 `HANDOFF.md`를 참고하세요.
- 실제 계정 연동과 GitHub 업로드, Vercel 배포는 후속 작업입니다.
