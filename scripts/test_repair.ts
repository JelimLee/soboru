/**
 * test_repair.ts — 2단계 repair 트리거의 일관성 검증 (LLM 호출 있음, 유료)
 *
 * 암묵 신호 → check(이해확인 질문) / 명시 신호 → full(재설명) / 수용 → none.
 * 6개 경계 케이스를 실제 classify 모델에 통과시켜 판정이 흔들리지 않는지 본다.
 * 특히 "ㅜㅜ 알겠습니다"(감정 섞인 수용)를 미이해로 오독하지 않는지가 핵심 케이스다.
 *
 * 실행: npm run eval:repair   (OPENAI_API_KEY 필요)
 * 실패한 케이스가 하나라도 있으면 종료 코드 1.
 */
import { classify } from "../server/agents/classify";
import { decideRepairMode } from "../server/lib/repair";
import type { RepairMode } from "../server/lib/types";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY가 없습니다 — 이 검증은 실제 모델 호출이 필요합니다(.env 확인).");
  process.exit(1);
}

const history = [
  { role: "user" as const, content: "적금 월 납입금 낮출 수 있나요?" },
  { role: "assistant" as const, content: "적금은 보통 가입 시 정한 금액을 계약 기간 동안 유지해야 하며, 중간에 줄이기 어렵습니다. 납입이 힘들면 중도해지도 방법입니다." },
];

const cases: { msg: string; expect: RepairMode; note: string }[] = [
  { msg: "ㅜㅜ 알겠습니다", expect: "none", note: "ACCEPT(감정 섞임) — 감정을 문제로 오독하면 안 됨" },
  { msg: "네 감사합니다", expect: "none", note: "ACCEPT" },
  { msg: "아 네... 근데 그게 좀...", expect: "check", note: "암묵 신호 — 데모 시나리오 2 하이라이트" },
  { msg: "알겠는데요, 근데 그럼 지금까지 낸 건 어떻게 되는 거죠?", expect: "check", note: "조건부 수용" },
  { msg: "그게 무슨 뜻이에요? 이해가 안 돼요", expect: "full", note: "명시적 미이해" },
  { msg: "그래서 방법이 아예 없다는 거예요?", expect: "full", note: "명시적 불만" },
];

let pass = 0;
for (const { msg, expect, note } of cases) {
  const c = await classify(msg, history);
  const mode = decideRepairMode(c.dispreferred_signal, history);
  const ok = mode === expect;
  if (ok) pass++;
  console.log(
    `${ok ? "✅" : "❌"} "${msg}"\n   signal=${c.dispreferred_signal}  mode=${mode} (기대: ${expect})  — ${note}`,
  );
}
console.log(`\n${pass}/${cases.length} 통과`);
if (pass < cases.length) process.exitCode = 1;
