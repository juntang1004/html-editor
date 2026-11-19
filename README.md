# HTML Slide Studio 0.3

Rust/Tauri Windows 앱과 HTML 슬라이드 편집기입니다. 기존 배포본을 보존한 별도 개발 저장소에서 구현했습니다. 네이티브 파일 작업은 Rust, 슬라이드 표현은 HTML/CSS/JavaScript, 기존 OpenAI API 처리는 동봉한 Node 사이드카가 담당합니다.

## 실행

`artifacts/HTML-Slide-Studio-Windows-x64/HTML Slide Studio.exe`를 실행하세요. `resources` 폴더를 실행 파일 옆에 유지해야 합니다. Windows 10/11 x64와 WebView2가 필요하며, 이 컴퓨터에서 실행을 확인했습니다. 별도의 Node 설치는 필요하지 않습니다.

[한국어 사용 안내](docs/user-guide.ko.md) · [데스크톱 구조와 빌드](docs/desktop.md) · [AI 액션 계약](docs/animation-ai.md)

## 구현

- 원본 CSS 문맥·grid/block/flex·canvas 그림을 보존하는 썸네일
- 파일 메뉴, 탭별 리본, 크기 조절 가능한 좌우 패널
- Delete 및 편집 단축키, 영역/Ctrl/Shift 다중 선택, 일괄 이동·정렬·삭제·실행취소
- 선택과 별도로 유지되는 전체 개체 테두리 표시
- 네이티브 열기·저장·다른 이름 저장, HTML·프로젝트 내보내기, 전체 슬라이드 PDF 인쇄
- 기존 액션 추가·수정·삭제, CSS 애니메이션 시간 변경, 완료 시점에 연결되는 순차 효과
- 53개 오프라인 효과 갤러리와 모션 감소, 음성 입력 제거

## 검증 (2026-11-19)

- Node 단위·서버 36개 통과
- Chromium 브라우저 47개 통과: 기대 실패 표시 없음
- Rust 테스트 2개 통과
- Windows WebView2 실행, 로컬 API 연결, native IPC 격리, 저장 경로 검사, 백엔드 종료 확인
- 실제 OpenAI API 2개 사례 통과: 원본 200ms→2000ms 변경, 검정 화면 밝아짐 완료 후 그래프 성장
- 실제 Windows 파일·인쇄 대화상자 조작 검사는 화면 도구 시간 초과로 미완료. 파일 쓰기 로직과 PDF 페이지·배치는 자동 테스트로 확인

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run test:all
npm.cmd run desktop:build
node scripts/desktop-smoke.mjs
```

Rust 도구는 `scripts/dev-shell.ps1`에 정리돼 있습니다. PowerShell 스크립트 정책 변경은 필요하지 않으며 `desktop:build`는 Node 스크립트로 빌드합니다. 빌드 캐시는 OneDrive 밖 `%LOCALAPPDATA%/SlideStudioDev/cargo-target`에 저장합니다.

API 키는 배포본/Git에 포함하지 않습니다. 사용자가 재사용을 승인한 키는 `%APPDATA%/com.slidestudio.editor/.env.local`에 별도로 설정했습니다. 자동 테스트는 모의 API이며 `scripts/qa-live-ai.mjs --run-live`만 명시적으로 실제 요청을 합니다.

임의 JavaScript 전체 재작성, 상대 경로 로컬 자산 자동 묶음, 이미지/canvas 그래프 내부 요소 분리는 지원 범위 밖입니다. 자세한 제한은 사용 안내를 참고하세요.
