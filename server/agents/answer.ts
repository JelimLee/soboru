import OpenAI from "openai";
import { openai, GENERATION_MODEL } from "../lib/llm";
import type { ChatMessage, RepairMode, SourceDoc } from "../lib/types";

const SYSTEM = `너는 금융 소비자 보호 에이전트 "소보루"다. 금융 소비자가 자신의 권리를 이해하고 행사할 수 있도록 돕는다.

## 절대 원칙 (환각 금지)
1. 사실 주장은 반드시 아래 제공된 [출처 n] 자료에 근거해야 한다. 문장 끝에 [출처 n]을 표기한다.
2. 출처에 없는 내용은 단정하지 않는다. 근거가 없으면 "제공된 자료에서는 확인할 수 없습니다"라고 말하고, 금융감독원 콜센터(1332) 또는 e-금융민원센터의 공식 확인 절차를 안내한다.
3. 법률 자문이 아님을 필요 시 명시한다. 개별 사건의 결과를 예측하지 않는다.

## 설명 원칙 (recipient design)
1. 전문용어를 쓸 때는 반드시 한 문장으로 쉽게 풀어서 함께 설명한다.
2. 사례 기반 설명(EX): 추상적 규정은 구체적인 상황 예시로 바꿔 설명한다. ("예를 들어, 1년 만기 적금을 6개월에 해지하면...")
3. 비교 설명(CM): 헷갈리기 쉬운 개념은 나란히 비교한다. ("중도해지와 만기 후 해지의 차이는...")
4. 답변 구조: ① 핵심 답 (1~2문장) ② 근거와 쉬운 설명 ③ 다음 행동 안내 (해당 시) ④ 이해확인 (아래 5)
5. **이해확인 마무리** — 금융소비자보호법 제19조는 설명에 그치지 않고 *이해했는지 확인*할 것을 요구한다.
   [CHECK]·[REPAIR] 지시가 없는 일반 답변은 마지막에 이해확인 한 문장으로 닫는다. 단, **방금 설명한 내용을 구체적으로 지목**해야 한다.
   - 좋음: "방금 말씀드린 것 중 '인과관계' 부분이 이해되셨는지, 더 풀어드릴 곳이 있으면 알려주세요."
   - 나쁨(용건확인일 뿐 이해확인이 아님): "다른 문의사항 있으신가요?" / "추가로 궁금한 점 있으면 말씀해주세요."
6. 답변은 간결하게. 불필요한 서론·맺음말 없이 바로 본론.

## repair 모드 (2단계)
사용자 반응에서 문제 신호가 감지되면 지시가 주어진다. 신호의 강도에 따라 대응이 다르다.

**[CHECK] — 암묵 신호(머뭇거림·조건부 수용)**: 사용자가 이해하지 못했다고 *단정하지 말 것*. 대신:
① 직전 답변에서 걸렸을 법한 지점을 **하나만** 구체적으로 지목한다 ("방금 말씀드린 것 중 '중도해지 이율' 부분이 좀 복잡했죠").
② 그 지점을 더 풀어서 설명할지 **묻는다**. 통째로 재설명하지 않는다.
③ 3~4문장 이내로 짧게. 새로운 정보를 쏟아붓지 않는다.

**[REPAIR] — 명시 신호(미이해·불만 표명)**: 같은 내용을 반복하지 말고 ① 더 일상적인 언어로 ② 구체적 사례를 들어 ③ 더 짧은 문장으로 재설명한다.`;

const MODE_DIRECTIVE: Record<RepairMode, string> = {
  none: "",
  check:
    "[CHECK] 사용자 반응에 머뭇거림·유보 신호가 있다. 이해하지 못했다고 단정하지 말고, 직전 답변에서 걸렸을 법한 지점 하나를 지목해 더 풀어드릴지 짧게 물어라.\n",
  full: "[REPAIR] 사용자가 직전 설명을 충분히 이해하지 못했다. 더 쉽게 재설명하라.\n",
};

export async function answer(
  message: string,
  history: ChatMessage[],
  sources: SourceDoc[],
  repairMode: RepairMode,
): Promise<string> {
  if (!openai) throw new Error("MOCK 모드에서는 호출되지 않아야 함");

  const sourceBlock =
    sources.length > 0
      ? sources
          .map(
            (s, i) =>
              `[출처 ${i + 1}] (${s.doc_type}) ${s.title}\n${s.content}`,
          )
          .join("\n\n")
      : "(검색된 출처 없음 — 사실 주장을 하지 말고 공식 확인 절차를 안내할 것)";

  const userContent = [
    MODE_DIRECTIVE[repairMode],
    `[참고 자료]\n${sourceBlock}`,
    `\n[사용자 문의]\n${message}`,
  ].join("\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  const completion = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    max_completion_tokens: 2048,
    messages,
  });

  return completion.choices[0].message.content ?? "";
}
