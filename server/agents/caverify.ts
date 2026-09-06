import { openai, JUDGE_MODEL, parseJson } from "../lib/llm";
import { formatSources } from "../lib/prompt";
import type { CAReport, RepairMode, SourceDoc } from "../lib/types";

/**
 * CA 자가검증기 — CODEBOOK_finance.md v0.6 의 F1·F2·F4·F6 실패모드를
 * 대화분석(repair·preference) 이론으로 답변에 적용. 각 차원은 원문 근거 필수.
 * 핵심: F2 embedded-refusal 스캔(v0.6 규칙) — 안내 톤 속 숨은 거절을 잡는다.
 */
const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    f1_jargon: {
      type: "object",
      properties: {
        pass: { type: "boolean", description: "전문용어에 평이한 풀이가 함께 있으면 true. 풀이 없는 용어가 하나라도 있으면 false" },
        unglossed_terms: { type: "array", items: { type: "string" }, description: "풀이 없이 쓰인 금융 전문용어" },
        evidence: { type: "string", description: "판정 근거가 된 답변 내 문구(원문 인용)" },
      },
      required: ["pass", "unglossed_terms", "evidence"],
      additionalProperties: false,
    },
    f2_refusal: {
      type: "object",
      properties: {
        has_refusal: { type: "boolean", description: "요청 거절/불가/불충족 통지가 있는가. 안내 톤이라도 '불가/어렵습니다/할 수 없/안 됩니다' 표지가 있으면 true (embedded refusal 스캔)" },
        account: { type: "boolean", description: "거절의 이유가 제시됐는가" },
        alternative: { type: "boolean", description: "대안 경로가 제시됐는가" },
        mitigation: { type: "boolean", description: "사과·완화 표현이 있는가" },
        bald: { type: "boolean", description: "has_refusal이면서 account/alternative/mitigation이 모두 없으면 true(맨살거절)" },
        evidence: { type: "string", description: "거절 관련 원문 인용(없으면 빈 문자열)" },
      },
      required: ["has_refusal", "account", "alternative", "mitigation", "bald", "evidence"],
      additionalProperties: false,
    },
    f4_understanding: {
      type: "object",
      properties: {
        understanding_check: { type: "boolean", description: "직전 설명의 '이해 여부'를 확인하는 문장이 있는가(진짜 이해확인). '더 궁금한 점 있으세요'류(용건확인)는 여기 해당 안 됨" },
        pre_closing_only: { type: "boolean", description: "이해확인 없이 용건확인(PRE-CLOSING)만으로 마무리했는가" },
        evidence: { type: "string" },
      },
      required: ["understanding_check", "pre_closing_only", "evidence"],
      additionalProperties: false,
    },
    f6_disclosure: {
      type: "object",
      properties: {
        applicable: { type: "boolean", description: "답변이 다루는 처리·상품에 고지할 비용/불이익/기한/리스크가 존재하는가" },
        disclosed: { type: "boolean", description: "applicable일 때, 해당 고지가 실제로 이뤄졌는가" },
        missing: { type: "array", items: { type: "string" }, description: "누락된 고지 항목" },
        evidence: { type: "string" },
      },
      required: ["applicable", "disclosed", "missing", "evidence"],
      additionalProperties: false,
    },
    summary: { type: "string", description: "이 답변의 설명의무 이행 수준 1문장 요약. 금융소비자보호 언어로 쓸 것 (예: '용어 풀이와 불이익 고지는 이행됐으나 이해 여부 확인 없이 종결'). CA 학술용어(repair, preference 등) 사용 금지" },
  },
  required: ["f1_jargon", "f2_refusal", "f4_understanding", "f6_disclosure", "summary"],
  additionalProperties: false,
};

const SYSTEM = `너는 금융상담 답변이 **금융소비자보호법 제19조(설명의무)의 취지를 대화 수준에서 이행했는지** 판정하는 맹검 평가자다. §19는 판매업자에게 ① 중요사항을 소비자가 이해할 수 있도록 설명하고 ② 이해 여부를 확인할 것을 요구한다 — F1(용어)·F4(이해확인)·F6(고지)은 이 의무의 대화적 이행 여부이고, F2(거절 응대)는 민원·분쟁으로 번지는 전조를 잡는다. 판정 루브릭은 대화분석(CA)의 repair·preference 연구(Schegloff/Pomerantz)에서 조작화되었으며, 답변을 생성한 모델과 무관하게 독립 판정한다.

## 판정 원칙
1. **형식이 아니라 실질**로 판정한다. "예를 들어"가 있다고 통과가 아니고, 실제 수행이 있어야 한다. 각 차원마다 답변 원문에서 근거를 인용한다.
2. **F2 숨은 거절 스캔이 핵심**: 답변이 요청을 완전히 들어주지 못하는 부분을 반드시 찾아라. "직접 처리할 수 없습니다", "확인이 어렵습니다", "불가합니다" 같은 표지는 정중한 안내 톤에 섞여 있어도 거절(has_refusal=true)이다. 그 거절에 이유(account)·대안(alternative)·완화(mitigation)가 각각 있는지 독립적으로 표시하고, 셋 다 없으면 bald=true.
3. **F4**: '이해되셨나요'처럼 직전 설명의 이해를 확인하면 understanding_check=true. '더 궁금한 점 있으세요'(용건확인)만 있으면 pre_closing_only=true, understanding_check=false.
4. 애매하면 소비자에게 불리한(엄격한) 쪽으로 판정한다.
5. **summary는 위 구조화된 판정과 반드시 일치해야 한다.** has_refusal=false로 판정했다면 summary에서 거절 대응을 문제 삼지 말고, 미적용(na) 처리한 차원을 실패처럼 서술하지 마라. 화면에 등급과 나란히 표시되므로 서로 어긋나면 안 된다.`;

/**
 * 턴 종류 고지 — 이해확인 턴(check)은 '답변 턴'이 아니라 '직전 설명에 대한 확인 질문'이다.
 * 답변 턴 기준으로 채점하면 "설명해드릴까요?"를 거절로 오독한다(실측된 오판).
 */
const CHECK_TURN_NOTE = `

## ⚠ 이 턴의 종류: 이해확인 턴
판정 대상 답변은 새로운 설명을 제공하는 턴이 아니라, **직전 설명 중 어느 부분이 걸렸는지 확인하고 더 풀어드릴지 묻는 턴**이다. 다음을 반드시 지켜라.
1. **설명을 제공하겠다는 제안·질문은 거절이 아니다.** "더 쉽게 설명해드릴까요?"는 요청을 들어주겠다는 뜻이므로 has_refusal=false다. 이것을 거절로 판정하지 마라.
2. **직전 설명의 이해 여부를 묻고 있으면 understanding_check=true다.** 이 턴의 존재 목적이 곧 이해확인이다.
3. 아직 설명을 제공하는 턴이 아니므로, 용어 풀이(F1)와 중요사항 고지(F6)는 이 턴의 평가 대상이 아니다. 해당 항목은 형식적으로만 채우고 evidence는 빈 문자열로 둔다.`;

/** 판정 원문(LLM 출력) — 집계 전 단계. */
export type CAVerdicts = Omit<CAReport, "score" | "applicable" | "grade">;

/**
 * 적용 가능한 차원 중 통과 비율을 등급으로 환산한다.
 * 적용 가능한 차원이 하나도 없으면(예: 판정할 거리가 없는 턴) 감점 근거가 없으므로 A.
 */
export function grade(score: number, applicable: number): CAReport["grade"] {
  if (applicable === 0) return "A";
  const r = score / applicable;
  return r >= 0.9 ? "A" : r >= 0.7 ? "B" : r >= 0.4 ? "C" : "D";
}

/**
 * 결정론적 집계 — 등급을 LLM에게 맡기지 않고 차원별 pass/fail에서 직접 계산한다.
 * 같은 판정 원문이면 항상 같은 등급이 나와야 화면·리포트가 서로 어긋나지 않는다.
 *
 * 미적용(na) 규칙:
 * - F2는 거절이 있을 때만 — 거절하지 않은 답변에 "거절 응대"를 채점할 수 없다.
 * - F6은 고지 대상이 있을 때만.
 * - 이해확인 턴(`check`)은 **설명을 제공하는 턴이 아니므로** F1(용어 풀이)·F6(고지)이
 *   구조적으로 미적용이다. 이 예외가 없으면 "더 풀어드릴까요?" 한 문장이
 *   용어 풀이 실패로 채점된다.
 */
export function aggregateCA(p: CAVerdicts, isCheckTurn: boolean): CAReport {
  const dims: boolean[] = [];
  if (!isCheckTurn) dims.push(p.f1_jargon.pass); // F1: 용어 풀이 여부
  if (p.f2_refusal.has_refusal) dims.push(!p.f2_refusal.bald); // F2: 맨살거절이 아니면 pass
  // F4: 이해확인이 있으면 pass, 이해확인 없이 용건확인만으로 닫으면 fail
  dims.push(!p.f4_understanding.pre_closing_only || p.f4_understanding.understanding_check);
  if (!isCheckTurn && p.f6_disclosure.applicable) dims.push(p.f6_disclosure.disclosed); // F6

  const applicable = dims.length;
  const score = dims.filter(Boolean).length;
  return { ...p, score, applicable, grade: grade(score, applicable) };
}

export async function caverify(
  question: string,
  reply: string,
  sources: SourceDoc[],
  turnType: RepairMode = "none",
): Promise<CAReport> {
  if (!openai) throw new Error("MOCK 모드에서는 호출되지 않아야 함");
  const isCheckTurn = turnType === "check";

  const sourceBlock = formatSources(sources, { emptyText: "(출처 없음)" });

  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: isCheckTurn ? SYSTEM + CHECK_TURN_NOTE : SYSTEM },
      {
        role: "user",
        content: `[사용자 질문]\n${question}\n\n[제공된 출처]\n${sourceBlock}\n\n[판정 대상 답변]\n${reply}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "ca_report", strict: true, schema: SCHEMA },
    },
  });

  return aggregateCA(
    parseJson<CAVerdicts>(completion.choices[0].message.content),
    isCheckTurn,
  );
}
