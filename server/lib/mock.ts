import type { CAReport, ClassifyResult, QualityReport, SourceDoc } from "./types";

// OPENAI_API_KEY 없이도 UI·파이프라인 개발이 가능하도록 하는 목 응답

export const MOCK_SOURCES: SourceDoc[] = [
  {
    id: "mock-1",
    doc_type: "law",
    title: "금융소비자보호법 제19조(설명의무) 요약 [예시 데이터]",
    content:
      "금융상품판매업자는 일반금융소비자에게 계약 체결을 권유하는 경우 금융상품의 중요한 사항을 이해할 수 있도록 설명하여야 한다.",
    source_url: "https://law.go.kr",
  },
];

export const MOCK_CLASSIFY: ClassifyResult = {
  category: "simple_inquiry",
  keywords: ["적금", "중도해지"],
  dispreferred_signal: "none",
};

export const MOCK_QUALITY: QualityReport = {
  source_coverage: 1.0,
  term_difficulty: "easy",
  strategies: { example_used: true, comparison_used: false },
  unsupported_claims: [],
  verdict: "grounded",
};

export const MOCK_CA: CAReport = {
  f1_jargon: { pass: true, unglossed_terms: [], evidence: "'중도해지 이율'을 쉬운 말로 풀어 설명" },
  f2_refusal: { has_refusal: false, account: false, alternative: false, mitigation: false, bald: false, evidence: "" },
  f4_understanding: { understanding_check: false, pre_closing_only: true, evidence: "약관 확인 안내로 종결" },
  f6_disclosure: { applicable: true, disclosed: true, missing: [], evidence: "중도해지 이율 불이익 고지" },
  score: 3,
  applicable: 3,
  grade: "A",
  summary: "(MOCK) 용어 풀이와 불이익 고지는 이행됐으나 이해 여부 확인 없이 종결",
};

export const MOCK_REPLY = `(MOCK 모드 — .env에 OPENAI_API_KEY를 설정하세요)

적금을 만기 전에 해지하면 약정 금리보다 낮은 '중도해지 이율'이 적용됩니다 [출처 1].

쉽게 말하면, 은행과 약속한 기간을 지키지 못했기 때문에 이자를 처음 약속한 만큼 다 받지 못하는 것입니다. 예를 들어 연 4% 약정으로 1년 만기 적금에 가입했더라도, 6개월 만에 해지하면 연 1~2% 수준의 이자만 받게 되는 경우가 많습니다.

정확한 중도해지 이율은 가입하신 상품의 약관에서 확인하실 수 있습니다.`;
