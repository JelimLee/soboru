import { classify } from "../server/agents/classify";
import { retrieve } from "../server/agents/retrieve";
import { answer } from "../server/agents/answer";
import { caverify } from "../server/agents/caverify";

const questions = [
  "이체 한도가 100만원밖에 안 되는데 어떻게 바꿔요?",
  "적금을 월 50만원에서 10만원으로 낮출 수는 없나요?",
];
for (const q of questions) {
  const c = await classify(q, []);
  const src = await retrieve(c.keywords);
  const reply = await answer(q, [], src, false);
  const ca = await caverify(q, reply, src);
  console.log("\n" + "=".repeat(70));
  console.log("Q:", q);
  console.log("검색된 출처:", src.map((s) => s.title).join(" / ") || "(없음)");
  console.log("답변:", reply.slice(0, 240).replace(/\n+/g, " "));
  console.log(`CA 등급 ${ca.grade} (${ca.score}/${ca.applicable}) | F2 has_refusal=${ca.f2_refusal.has_refusal} bald=${ca.f2_refusal.bald} | F4 이해확인=${ca.f4_understanding.understanding_check}`);
}
