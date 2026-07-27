import { openai, JUDGE_MODEL, parseJson } from "../lib/llm";
import type { QualityReport, SourceDoc } from "../lib/types";

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    source_coverage: {
      type: "number",
      description: "사실 주장 문장 중 제공된 출처에 실제 근거가 있는 비율 (0~1)",
    },
    term_difficulty: {
      type: "string",
      enum: ["easy", "moderate", "hard"],
      description: "일반 소비자 기준 용어 난이도. 풀이 없는 전문용어가 있으면 hard",
    },
    strategies: {
      type: "object",
      properties: {
        example_used: {
          type: "boolean",
          description: "구체적 상황 예시(사례 기반 설명)가 실제로 있는가. 예시 형식만 있고 내용이 없으면 false",
        },
        comparison_used: {
          type: "boolean",
          description: "두 개념을 나란히 대비하는 비교 설명이 실제로 있는가",
        },
      },
      required: ["example_used", "comparison_used"],
      additionalProperties: false,
    },
    unsupported_claims: {
      type: "array",
      items: { type: "string" },
      description: "출처에 근거가 없는 사실 주장 문장 목록 (원문 인용)",
    },
    verdict: {
      type: "string",
      enum: ["grounded", "partial", "ungrounded"],
      description: "종합 판정: coverage>=0.9 grounded / >=0.5 partial / 미만 ungrounded",
    },
  },
  required: [
    "source_coverage",
    "term_difficulty",
    "strategies",
    "unsupported_claims",
    "verdict",
  ],
  additionalProperties: false,
};

const SYSTEM = `너는 금융 상담 답변의 품질을 판정하는 맹검 평가자다. 답변을 생성한 모델과 무관하게 독립적으로 판정한다.

## 판정 원칙
1. 답변이 "출처를 표기했다"는 것과 "출처에 실제로 그 내용이 있다"는 것은 다르다. 반드시 제공된 출처 원문과 대조해 실제 수행 기준으로 판정한다.
2. 설명 전략도 마찬가지 — "예를 들어"라는 표현이 있다고 example_used가 아니라, 소비자가 자기 상황에 대입할 수 있는 구체적 시나리오가 실제로 제시됐을 때만 true.
3. 인사말·절차 안내·면책 문구는 사실 주장이 아니므로 coverage 계산에서 제외한다.
4. 사실 주장이 **하나도 없는 턴**(예: "이 부분 더 풀어드릴까요?" 같은 이해확인 질문만 있는 답변)은 검증할 주장이 없는 것이므로 source_coverage=1, verdict="grounded"로 판정한다. 근거가 부족한 것이 아니라 주장 자체가 없는 경우다.
5. 판정은 엄격하게. 애매하면 낮은 쪽으로.`;

export async function judge(
  question: string,
  reply: string,
  sources: SourceDoc[],
): Promise<QualityReport> {
  if (!openai) throw new Error("MOCK 모드에서는 호출되지 않아야 함");

  const sourceBlock =
    sources.length > 0
      ? sources
          .map((s, i) => `[출처 ${i + 1}] ${s.title}\n${s.content}`)
          .join("\n\n")
      : "(출처 없음)";

  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `[사용자 질문]\n${question}\n\n[제공된 출처]\n${sourceBlock}\n\n[판정 대상 답변]\n${reply}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "quality_report", strict: true, schema: SCHEMA },
    },
  });

  return parseJson<QualityReport>(completion.choices[0].message.content);
}
