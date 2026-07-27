import { openai, JUDGE_MODEL, parseJson } from "../lib/llm";
import type { ChatMessage, ClassifyResult } from "../lib/types";

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["simple_inquiry", "complaint", "dispute", "out_of_scope"],
      description: "문의 유형",
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "검색용 핵심 키워드 2~4개 (금융 용어 중심, 조사 제거)",
    },
    dispreferred_signal: {
      type: "string",
      enum: [
        "none",
        "acceptance",
        "hesitation",
        "conditional_acceptance",
        "explicit_dissatisfaction",
        "lack_of_understanding",
      ],
      description: "직전 답변에 대한 third-position 반응. 수용이면 acceptance, 이해 실패면 lack_of_understanding 등",
    },
  },
  required: ["category", "keywords", "dispreferred_signal"],
  additionalProperties: false,
};

const SYSTEM = `너는 금융 소비자 보호 상담의 문의 이해 에이전트다. 사용자 발화를 분석해 JSON으로만 응답한다.

## 유형 분류
- simple_inquiry: 제도·상품·용어에 대한 일반 문의
- complaint: 금융사 응대·처리에 대한 불만 제기
- dispute: 금전적 손해·권리 침해를 다투는 분쟁 성격
- out_of_scope: 금융 소비자 보호와 무관한 질문

## third-position 반응 감지 (대화분석 기반)
직전 assistant 답변이 있을 때, 이번 사용자 발화가 그 답변에 대한 반응이면 다음을 판정한다:
- **acceptance**: "알겠습니다", "네 감사합니다", "그렇군요 알겠어요", "됐어요" 등 **수용·종결(ACCEPT/CLOSE)**. ⚠ 감정 표현이 섞여도("ㅜㅜ 알겠습니다", "아쉽지만 알겠어요") 받아들였으면 acceptance다. 이건 대화를 닫는 신호이지 문제 신호가 아니다.
- hesitation: 수용도 거부도 아닌 어정쩡한 머뭇거림("음... 그게...")으로, **다음 발화에서 되묻거나 곤란을 표출할 조짐**이 있을 때만.
- conditional_acceptance: "알겠는데요, 근데...", "그건 그렇다 치고" 등 조건·유보를 단 수용(뒤에 새 논점이 붙음)
- explicit_dissatisfaction: "그게 아니라요", "이해가 안 돼요", "그래서 방법이 없다는 거예요?" 등 답변이 문제를 해결 못했다는 명시적 표현
- lack_of_understanding: 같은 내용을 다시 묻거나, 방금 설명한 용어의 뜻을 되묻는 경우
- none: 위 어디에도 해당하지 않는 새로운 문의/후속 질문

## 핵심 원칙 (repair 오발동 방지)
1. **감정(affect) ≠ 상호작용 문제(trouble)**: "ㅜㅜ", "아쉽다" 같은 감정이 있어도, 내용을 받아들였으면 acceptance다. 감정을 미이해/불만으로 오독하지 말 것.
2. 정상적인 후속 질문(더 알고 싶어서 묻는 것)은 none이다.
3. lack_of_understanding·explicit_dissatisfaction은 "설명이 통하지 않았다"는 **명확한 증거**가 있을 때만 잡는다. 이 둘은 전면 재설명을 발동시키므로 기준이 높다.
4. 반면 hesitation·conditional_acceptance는 **조짐 단계**의 판정이다. 시스템은 이 신호에 재설명이 아니라 "이 부분 더 풀어드릴까요?" 같은 **확인 질문**으로만 대응하므로, 애매하면 none으로 눌러버리지 말고 이 둘 중 하나로 잡아라. 확신이 없어 놓치는 것보다 가볍게 확인하는 편이 낫다.`;

export async function classify(
  message: string,
  history: ChatMessage[],
): Promise<ClassifyResult> {
  if (!openai) throw new Error("MOCK 모드에서는 호출되지 않아야 함");

  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const context = lastAssistant
    ? `[직전 답변]\n${lastAssistant.content.slice(0, 800)}\n\n[사용자 발화]\n${message}`
    : `[사용자 발화]\n${message}`;

  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "classify_result", strict: true, schema: SCHEMA },
    },
  });

  return parseJson<ClassifyResult>(completion.choices[0].message.content);
}
