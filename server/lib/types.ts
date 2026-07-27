// 서버-클라이언트 공유 타입 (src/lib/types.ts와 동일하게 유지할 것)
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
    | "acceptance" // 수용·종결(ACCEPT) — 감정 섞여도 수용이면 여기. repair 발동 안 함
    | "hesitation"
    | "conditional_acceptance"
    | "explicit_dissatisfaction"
    | "lack_of_understanding";
}

/**
 * 2단계 repair — CA의 repair initiation은 단계적이라는 원칙을 제품화.
 * - "check": 암묵 신호(hesitation·conditional_acceptance). 단정하지 않고 **이해확인 질문**으로
 *   trouble-source를 특정한다. 오판이어도 자연스러운 대화라 발동 비용이 낮다.
 * - "full": 명시 신호(lack_of_understanding·explicit_dissatisfaction). 전면 재설명.
 * 기존 시스템이 "명시 신호만 잡고 암묵 신호는 놓친다"(P2 실측)는 문제의 해법.
 */
export type RepairMode = "none" | "check" | "full";

export interface QualityReport {
  source_coverage: number;
  term_difficulty: "easy" | "moderate" | "hard";
  strategies: {
    example_used: boolean;
    comparison_used: boolean;
  };
  unsupported_claims: string[];
  verdict: "grounded" | "partial" | "ungrounded";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * CA 자가검증 리포트 — CODEBOOK_finance.md v0.6 의 F1~F6 실패모드를
 * 에이전트 답변에 적용. 각 차원은 pass + 원문 근거(evidence)를 요구한다.
 * (judge.ts=근거성/grounding 담당, caverify.ts=CA 상호작용 품질 담당)
 */
export interface CAReport {
  // F1 용어 방치: 전문용어를 평이한 풀이 없이 사용했는가
  f1_jargon: { pass: boolean; unglossed_terms: string[]; evidence: string };
  // F2 맨살 거절(v0.6 embedded refusal 스캔): 거절을 이유·대안·완화 없이 통보했는가
  f2_refusal: {
    has_refusal: boolean;
    account: boolean;
    alternative: boolean;
    mitigation: boolean;
    bald: boolean; // has_refusal && !(account||alternative||mitigation)
    evidence: string;
  };
  // F4 이해확인 부재: PRE-CLOSING(용건확인)만으로 종결했는가 vs 진짜 이해확인
  f4_understanding: { understanding_check: boolean; pre_closing_only: boolean; evidence: string };
  // F6 고지의무 누락: 결부된 비용·불이익·기한·리스크를 고지했는가
  f6_disclosure: { applicable: boolean; disclosed: boolean; missing: string[]; evidence: string };
  score: number; // 적용 가능한 차원 중 pass 개수
  applicable: number; // 적용 가능한 차원 수(na 제외)
  grade: "A" | "B" | "C" | "D";
  summary: string;
}
