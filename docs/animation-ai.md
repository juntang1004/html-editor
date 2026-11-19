# AI 애니메이션 편집 · 효과 갤러리

## 사용자 안내 (AI 상태와 설정)

| 화면 상단 표시 | 의미 | 애니메이션 명령 동작 |
|---|---|---|
| `● AI 연결 준비됨` | 로컬 서버가 API 키를 읽었음 | AI(OpenAI Responses API) 먼저 → 실패하면 기본 해석기 |
| `○ API 키 설정 필요` | 서버는 실행 중이나 키 없음 | 기본 해석기만 사용 (오프라인, 비용 없음) |
| `기본 편집 모드 · …` | 서버 없이 파일로 열림 | 기본 해석기만 사용 |

- API 키 설정: 앱 폴더의 `.env.local`에 `OPENAI_API_KEY=...`(선택: `OPENAI_MODEL=...`)를 넣고 서버(`node server.mjs` 또는 데스크톱 앱)를 다시 시작합니다. 환경 변수가 `.env.local`보다 우선합니다. 키는 브라우저나 `/api/session` 응답에 노출되지 않습니다.
- AI 패널 → 작업 종류 “액션 · 애니메이션” → **기본 해석기만 사용** 체크 시 API를 호출하지 않습니다.
- 결과 상단 배지가 출처를 표시합니다: `AI 제안 (OpenAI API)` 또는 `기본 해석기 (오프라인 규칙)`. API 실패로 대체된 경우 실패 사유를 함께 표시합니다.
- 모든 제안은 **미리보기 → 적용**이며, 적용은 한 번의 Ctrl+Z로 되돌립니다.

### 기본 해석기가 확실히 처리하는 명령
- 시간 변경: “0.2초 애니메이션을 2초로 바꿔줘”, “200ms를 2초로”, “막대 애니메이션을 2초로 늘려줘”, “2배 느리게”. 기존 액션(update)과 원본 CSS 애니메이션(native)을 수정하며 새 액션을 만들지 않습니다. 후보가 여럿이면 현재 이름·길이를 보여 주고 지정해 달라고 합니다.
- 순서 연결: “검은 화면에서 서서히 밝아진 다음 그래프가 자라나게 해줘” → 슬라이드 `black-reveal`(진입) → 그래프 `grow-bars`(앞 효과 **완료 후** 시작).
- 효과 추가: 갤러리 효과 이름/키워드 + 대상(선택, 제목, 본문, 그래프, 이미지, “따옴표 속 개체 글자”) + 시작(클릭/마우스/진입) + “N초 동안”, “N초 후에”(지연).
- 삭제: “막대 애니메이션 삭제해줘” (원본 애니메이션은 끄기).

## 요청 계약 (`POST /api/action`, 헤더 `X-Studio-Token`)

```json
{"prompt":"…","selectedId":"…","selectedIds":["…"],"currentSlide":"slide-0",
 "scene":[{"id":"s0-n1","tag":"h1","text":"…"},{"id":"slide-0","tag":"slide","text":"제목"}],
 "actions":[{"id":"fx-…","name":"…","trigger":"enter|click|hover|after","triggerId":"","targetId":"…","effect":"fade-in","duration":200,"delay":0,"value":"","initialHidden":true,"afterId":""}],
 "native":[{"id":"motion:grow","name":"막대 그래프 늘어나기","detail":"…","duration":200,"delay":0,"targets":["s0-n13"]}]}
```

응답: `{explanation, operations[], source:"api", actions:[add ops], model, usage}`. 구조화 출력 이름 `slide_animation_edit`, strict, 모든 필드 필수(미변경은 `null`).

| op | 의미 |
|---|---|
| `update` | 기존 액션 id의 non-null 필드만 변경 (0.2→2초는 `duration:2000`) |
| `native` | 원본 CSS 애니메이션(`motion:<name>`)의 `duration`/`delay` 변경 → 해당 요소 패치 `animation-duration` 목록 |
| `delete` | 액션 삭제 또는 원본 애니메이션 끄기 |
| `add` | 새 액션; `id`는 임시 ref, `trigger:"after"`+`afterId`(기존 id 또는 앞 ref)로 완료 의존 연결 |

오류 코드: `invalid_proposal`(구체적 한국어 메시지 + `hint`), `api_unreachable`(502, 클라이언트가 기본 해석기로 대체), `timeout`, `model_refusal`, `empty_output`, 기존 403/413/429/503. 이전 `{actions:[…]}` 모델 출력도 add 연산으로 정규화합니다.

## 번들링 (데스크톱 사이드카)

`server.mjs` import: `./public/design.js`, `./public/effects.js`, `./public/animation.js`, `./design-prompt.mjs`.
정적 자원 추가: `public/effects.js`, `public/animation.js`, `public/animation-ui.js`, `public/effects.css` (index.html에서 로드). 외부 CDN/폰트/라이브러리 없음.

`buildHtml`은 캔버스·미리보기·**단독 내보내기 HTML** 모두에 `<script id="ss-effects">`로 효과 엔진을 넣습니다(`window.__ssEffects`). 내보낸 파일은 편집기 전역 없이 동작합니다.

## 효과 갤러리

`public/effects.js` 53개(등장 15, 퇴장 4, 강조 9, 텍스트·목록 8, 그래프 10, 화면 전환 5, 연속 효과 2). 연구 문서 54개 중 미구현: 44 경로 따라 이동. 49 기준선은 기존 선 그리기(`arrow-draw`)로, 50 콜아웃은 펼치기로 단순화했습니다. 카드 미리보기·슬라이드 미리보기·발표·내보내기가 같은 등록부/실행기를 씁니다. 카드는 한 번에 하나만 재생하고 패널을 닫으면 멈춥니다.

그래프 효과는 데이터 마크만 움직입니다. 제외: `defs/clipPath/marker/text`, class·id에 axis/axes/domain/frame/grid/tick/label/legend/annot, `data-ss-axis`, 수평·수직 직선만으로 된 경로(축 모양). `data-ss-mark`가 하나라도 있으면 그 요소만 마크로 사용합니다. 막대는 기준선(최빈 경계)에서 자라며 음수 막대는 반대 방향입니다. 래스터 이미지·canvas 차트는 개별 막대를 인식하지 않습니다.

동작 줄이기: OS `prefers-reduced-motion` 또는 갤러리의 “동작 줄이기” 체크(로컬 저장, 발표·내보내기에도 반영) 시 이동·확대·회전 없이 짧은 투명도 변화/즉시 최종 상태로 바꾸고, 완료 이벤트는 유지되어 연결된 다음 효과가 계속 실행됩니다.
