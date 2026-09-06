/**
 * test_caverify.ts — CA 판정기의 변별력 확인 (LLM 호출 있음, 유료)
 *
 * 같은 질문에 대한 두 답변을 판정기에 넣는다.
 *   A = 거절이 안내 톤에 숨어 있고 용어 풀이·이해확인이 없는 답변
 *   B = 같은 거절이지만 이유·대안·완화 + 용어 풀이 + 처리기간 고지가 붙은 답변
 * 판정기가 A와 B에 다른 등급을 매기지 못하면 루브릭이 품질차를 못 잡는다는 뜻이다.
 * (등급은 눈으로 비교한다 — 이 스크립트는 기대값을 고정하지 않는다.)
 *
 * 실행: npm run eval:caverify   (OPENAI_API_KEY 필요)
 */
import { caverify } from "../server/agents/caverify";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY가 없습니다 — 이 검증은 실제 모델 호출이 필요합니다(.env 확인).");
  process.exit(1);
}

const Q = "제 급여통장이 금융거래한도 계좌라 이체가 막혀요. 한도를 지금 풀 수 있나요?";

// A: 거절이 '안내 톤'에 숨음 + 용어 방치 + 이해확인 없음 (사람도 놓치는 케이스)
const REPLY_A =
  "고객님 계좌는 금융거래한도 계좌로 등록되어 있습니다. 비대면 한도 해제는 상담사 화면에서는 직접 처리해 드리기 어렵습니다. 예금관리 메뉴에서 한도 해제를 선택해 보시기 바랍니다. 다른 문의 있으실까요?";

// B: 거절에 이유+대안+완화 + 용어 풀이 + 처리기간 고지
const REPLY_B =
  "결론부터 말씀드리면 유선으로는 바로 풀어드리기 어렵습니다. 금융거래한도 계좌란 신규 계좌의 이체를 하루 일정액으로 제한하는 보호장치인데요, 규정상 본인확인이 필요해 전화로는 해제가 안 됩니다(사유). 번거로우시겠지만 신분증을 지참해 가까운 영업점을 방문하시거나 팩스로 서류를 접수하시면 됩니다(대안). 접수 후 영업일 기준 2~3일 소요됩니다. 설명이 이해되셨을까요?";

for (const [label, reply] of [["A(숨은거절)", REPLY_A], ["B(완화됨)", REPLY_B]] as const) {
  const r = await caverify(Q, reply, []);
  console.log(`\n===== ${label}  →  등급 ${r.grade} (${r.score}/${r.applicable}) =====`);
  console.log("요약:", r.summary);
  console.log(`F1 용어풀이: ${r.f1_jargon.pass ? "OK" : "FAIL"} ${r.f1_jargon.unglossed_terms.length ? "미풀이["+r.f1_jargon.unglossed_terms.join(", ")+"]" : ""}`);
  const f2 = r.f2_refusal;
  console.log(`F2 거절: has=${f2.has_refusal} account=${+f2.account} alt=${+f2.alternative} mit=${+f2.mitigation}${f2.bald ? "  ← 맨살거절!" : ""}`);
  if (f2.evidence) console.log(`      근거: "${f2.evidence}"`);
  console.log(`F4 이해확인: check=${r.f4_understanding.understanding_check} preclosing_only=${r.f4_understanding.pre_closing_only}`);
  console.log(`F6 고지: applicable=${r.f6_disclosure.applicable} disclosed=${r.f6_disclosure.disclosed} ${r.f6_disclosure.missing.length ? "누락["+r.f6_disclosure.missing.join(", ")+"]" : ""}`);
}
