# 소보루 (working title)

**근거를 보여주고, 못 알아들으면 다시 설명하는 금융 소비자 보호 에이전트** 

전략·아키텍처 문서: `../docs/` (01 전략, 02 아키텍처, 03 일정, 04·05 제출물)

## 실행

```bash
npm install
cp .env.example .env   # OPENAI_API_KEY 입력 (없으면 MOCK 모드로 UI 확인 가능)
npm run dev            # web(5173) + api(8787) 동시 실행
```

- **MOCK 모드**: API 키 없이 UI·파이프라인 흐름 확인 가능
- **Supabase 없이도 동작**: `data/documents.jsonl` 로컬 검색 폴백

## 아키텍처

```
질문 → ① classify (mini)   문의 유형 + dispreferred 신호 감지
     → ② retrieve           키워드 매칭 (TODO: pgvector 업그레이드)
     → ③ answer  (gpt-4.1)  출처 인용 강제 + 쉬운 설명 + repair 모드
     → ④ judge   (mini)     맹검 재판정: 출처 커버리지·설명전략·용어 난이도
```

- 모델 티어 분리: 생성 `gpt-4.1` / 분류·판정 `gpt-4.1-mini` (교체는 `server/lib/llm.ts` 상수 2줄)
- ④가 ③의 자기주장을 신뢰하지 않고 출처 원문과 대조해 재판정하는 구조가 차별화 핵심

### 2단계 repair (`server/lib/repair.ts`)

CA의 repair initiation은 단계적이라는 원칙을 제품화 — 신호 강도에 따라 개입 수위가 다르다.

| ①의 신호 | 모드 | ③의 동작 |
|---|---|---|
| `hesitation`, `conditional_acceptance` (암묵) | `check` | 단정하지 않고 **걸린 지점 하나를 지목해 되묻는다**. 오판이어도 자연스러운 대화라 발동 비용이 낮음 |
| `lack_of_understanding`, `explicit_dissatisfaction` (명시) | `full` | 전면 재설명 (쉬운 언어 + 사례 + 짧은 문장) |
| `acceptance`, `none` | `none` | 발동 안 함 — ACCEPT는 시퀀스를 닫는 자리 |

기존 시스템이 "명시 신호는 잡고 **암묵 신호는 놓친다**"(P2 실측)는 문제의 해법.
⚠️ 이해확인 턴(`check`)은 설명 제공 턴이 아니므로 ④caverify에서 F1·F6이 미적용 처리된다 —
모드를 넘기지 않으면 "설명해드릴까요?"를 **맨살거절로 오독**한다(`caverify(…, sources, repairMode)`).

검증: `npx tsx --env-file-if-exists=.env scripts/test_repair.ts` (6케이스 트리거 테스트)

## 디렉토리

```
server/agents/   4개 에이전트 (classify / retrieve / answer / judge)
server/lib/      openai·supabase 클라이언트, mock
src/components/  Chat(출처 배지), QualityPanel(품질 패널)
supabase/        schema.sql (Supabase SQL Editor에서 실행)
scripts/         ingest.ts (jsonl → documents 테이블)
data/            documents.jsonl — 공개자료 기반 45건 (분쟁유형 21·FAQ 11·용어 7·법령 6)
                 CORPUS_SOURCES.md — 출처·검증 체크리스트 (case는 일반화 유형, 특정 사건 아님)
```

## 배포

Express 하나가 `/api/*`와 빌드된 프론트(`dist/`)를 함께 서빙하는 **단일 서비스** 구조라, Node를 돌릴 수 있는 곳이면 어디든 올라간다.

```bash
npm run build   # dist/ 생성
npm start       # 8787에서 API + 프론트 동시 서빙
```

**Render** (`render.yaml` 블루프린트 포함): 저장소 연결 → `OPENAI_API_KEY`만 대시보드에 입력 → 배포.
빌드 `npm install && npm run build` / 시작 `npm start` / 헬스체크 `/api/health`.

⚠️ **공개 URL은 곧 비용**이다. 누구나 호출할 수 있고 호출마다 OpenAI 요금이 나가므로 비용 가드가 기본 적용된다.

| 환경변수 | 기본값 | 의미 |
|---|---|---|
| `RATE_LIMIT_PER_IP` | 20 | IP당 시간당 요청 수 |
| `RATE_LIMIT_DAILY` | 300 | 서비스 전체 하루 요청 수 |

초과 시 429와 함께 안내 문구가 화면에 표시된다(오류처럼 보이지 않게 처리됨).
남은 한도는 `/api/health`의 `daily_remaining`으로 확인. 인메모리 카운터라 인스턴스 재시작 시 초기화된다.
`OPENAI_API_KEY`를 넣지 않으면 MOCK 모드로 뜨므로, 비용 없이 UI만 공개하는 것도 가능하다.

## Supabase 연결 (선택 → W2에서 필수)

1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 실행
2. `.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 입력
3. `npm run ingest` 로 데이터 적재

## TODO (docs/03_일정.md 기준)

- [x] `data/documents.jsonl` 공개자료 45건 적재 (7/27 — 분쟁 유형 21건 확장)
- [x] retrieve 키워드 토큰화 (구 단위 매칭 → 토큰 단위 + 제목 가중치 2)
- [ ] Supabase 연결 + 적재 — W2
- [ ] retrieve를 pgvector 유사도 검색으로 업그레이드 (임베딩 모델 결정 필요) — W2, 선택
- [ ] turns 테이블에 대화·판정 로그 저장 (PPT용 측정 데이터 축적) — W3
- [ ] 데모 시나리오 3종 리허설 (docs/02_아키텍처_구현.md §4) — W3
- [ ] 배포 (Vercel: 프론트 + api를 서버리스 함수로 이전, 또는 Railway에 서버 그대로) — W3

## 데이터 윤리

- 공개·비식별 자료만 사용. 수집 전 이용약관·공공누리 확인 (`license` 필드에 기록)
- API 키는 `.env`에만 — 커밋 금지 (`.gitignore`에 등록됨)
