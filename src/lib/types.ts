export type DocType = "law" | "case" | "faq" | "term";

export interface SourceDoc {
  id: string;
  doc_type: DocType;
  title: string;
  content: string;
  source_url: string | null;
}

export interface ClassifyResult {
  category: "simple_inquiry" | "complaint" | "dispute" | "out_of_scope";
  keywords: string[];
  dispreferred_signal:
    | "none"
    | "acceptance"
    | "hesitation"
    | "conditional_acceptance"
    | "explicit_dissatisfaction"
    | "lack_of_understanding";
}

// 2단계 repair: check=암묵 신호에 대한 이해확인 질문 / full=명시 신호에 대한 전면 재설명
export type RepairMode = "none" | "check" | "full";

export interface QualityReport {
  source_coverage: number; // 0~1: 답변 문장 중 출처 근거가 있는 비율
  term_difficulty: "easy" | "moderate" | "hard";
  strategies: {
    example_used: boolean; // EX: 사례 기반 설명
    comparison_used: boolean; // CM: 비교 설명
  };
  unsupported_claims: string[];
  verdict: "grounded" | "partial" | "ungrounded";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// CA 자가검증 (CODEBOOK_finance.md v0.6 F1·F2·F4·F6) — server/lib/types.ts와 동일
export interface CAReport {
  f1_jargon: { pass: boolean; unglossed_terms: string[]; evidence: string };
  f2_refusal: {
    has_refusal: boolean;
    account: boolean;
    alternative: boolean;
    mitigation: boolean;
    bald: boolean;
    evidence: string;
  };
  f4_understanding: { understanding_check: boolean; pre_closing_only: boolean; evidence: string };
  f6_disclosure: { applicable: boolean; disclosed: boolean; missing: string[]; evidence: string };
  score: number;
  applicable: number;
  grade: "A" | "B" | "C" | "D";
  summary: string;
}

export interface ChatResponse {
  reply: string;
  sources: SourceDoc[];
  classify: ClassifyResult;
  quality: QualityReport | null;
  ca: CAReport | null;
  repair_mode: RepairMode;
  mock: boolean;
}
