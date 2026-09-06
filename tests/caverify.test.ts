import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { aggregateCA, grade, type CAVerdicts } from "../server/agents/caverify";

/** 모든 차원이 통과인 판정 원문. 각 테스트는 여기서 필요한 차원만 뒤집어 쓴다. */
function verdicts(patch: Partial<CAVerdicts> = {}): CAVerdicts {
  return {
    f1_jargon: { pass: true, unglossed_terms: [], evidence: "" },
    f2_refusal: {
      has_refusal: false,
      account: false,
      alternative: false,
      mitigation: false,
      bald: false,
      evidence: "",
    },
    f4_understanding: { understanding_check: true, pre_closing_only: false, evidence: "" },
    f6_disclosure: { applicable: false, disclosed: false, missing: [], evidence: "" },
    summary: "",
    ...patch,
  };
}

describe("grade — 통과 비율 → 등급", () => {
  test("경계값", () => {
    assert.equal(grade(10, 10), "A"); // 1.0
    assert.equal(grade(9, 10), "A"); // 0.9 (경계 포함)
    assert.equal(grade(8, 10), "B"); // 0.8
    assert.equal(grade(7, 10), "B"); // 0.7 (경계 포함)
    assert.equal(grade(6, 10), "C"); // 0.6
    assert.equal(grade(4, 10), "C"); // 0.4 (경계 포함)
    assert.equal(grade(3, 10), "D"); // 0.3
    assert.equal(grade(0, 10), "D");
  });

  test("적용 가능한 차원이 없으면 감점 근거가 없으므로 A", () => {
    assert.equal(grade(0, 0), "A");
  });
});

describe("aggregateCA — 결정론적 집계", () => {
  test("거절이 없으면 F2는 채점 대상이 아니다", () => {
    // 거절하지 않은 답변에 '거절 응대 품질'을 매길 수는 없다.
    const r = aggregateCA(verdicts(), false);
    assert.equal(r.applicable, 2); // F1 + F4 (F2는 거절 없음, F6은 고지 대상 없음)
    assert.equal(r.score, 2);
  });

  test("맨살거절(bald)은 F2 실패로 집계된다", () => {
    const r = aggregateCA(
      verdicts({
        f2_refusal: {
          has_refusal: true,
          account: false,
          alternative: false,
          mitigation: false,
          bald: true,
          evidence: "처리해 드릴 수 없습니다.",
        },
      }),
      false,
    );
    assert.equal(r.applicable, 3); // F1 + F2 + F4
    assert.equal(r.score, 2); // F2만 실패
    assert.equal(r.grade, "C"); // 2/3 ≈ 0.67
  });

  test("거절에 이유·대안·완화가 하나라도 있으면 F2 통과", () => {
    const r = aggregateCA(
      verdicts({
        f2_refusal: {
          has_refusal: true,
          account: true,
          alternative: true,
          mitigation: false,
          bald: false,
          evidence: "규정상 유선 해제가 안 되어 영업점 방문이 필요합니다.",
        },
      }),
      false,
    );
    assert.equal(r.score, r.applicable);
    assert.equal(r.grade, "A");
  });

  test("이해확인 없이 용건확인만으로 종결하면 F4 실패", () => {
    const r = aggregateCA(
      verdicts({
        f4_understanding: {
          understanding_check: false,
          pre_closing_only: true,
          evidence: "다른 문의 있으실까요?",
        },
      }),
      false,
    );
    assert.equal(r.score, r.applicable - 1);
  });

  test("종결 턴이 아니면 F4는 감점하지 않는다", () => {
    // understanding_check=false 하나만으로 실패 처리하면 화면 배지와 등급이 어긋난다.
    const r = aggregateCA(
      verdicts({
        f4_understanding: { understanding_check: false, pre_closing_only: false, evidence: "" },
      }),
      false,
    );
    assert.equal(r.score, r.applicable);
  });

  test("고지 대상이 있는데 고지하지 않으면 F6 실패", () => {
    const r = aggregateCA(
      verdicts({
        f6_disclosure: {
          applicable: true,
          disclosed: false,
          missing: ["중도상환수수료"],
          evidence: "",
        },
      }),
      false,
    );
    assert.equal(r.applicable, 3); // F1 + F4 + F6
    assert.equal(r.score, 2); // F6만 실패
  });

  test("이해확인 턴에서는 F1·F6이 구조적으로 미적용", () => {
    // 이해확인 턴은 설명을 제공하는 턴이 아니다. 답변 턴 기준으로 채점하면
    // "더 풀어드릴까요?" 한 문장이 용어 풀이 실패·고지 누락으로 잡힌다.
    const bad = verdicts({
      f1_jargon: { pass: false, unglossed_terms: ["중도해지이율"], evidence: "" },
      f6_disclosure: { applicable: true, disclosed: false, missing: ["수수료"], evidence: "" },
    });
    const asCheckTurn = aggregateCA(bad, true);
    const asAnswerTurn = aggregateCA(bad, false);

    assert.equal(asCheckTurn.applicable, 1, "이해확인 턴에서는 F4만 남는다");
    assert.equal(asCheckTurn.grade, "A");
    assert.equal(asAnswerTurn.applicable, 3);
    assert.equal(asAnswerTurn.grade, "D");
  });

  test("판정 원문의 다른 필드는 그대로 실어 나른다", () => {
    const v = verdicts({ summary: "요약 문장" });
    const r = aggregateCA(v, false);
    assert.equal(r.summary, "요약 문장");
    assert.deepEqual(r.f2_refusal, v.f2_refusal);
  });

  test("불변식: 0 ≤ score ≤ applicable, 같은 입력이면 항상 같은 등급", () => {
    // 등급을 LLM에 맡기지 않고 코드가 계산하는 이유 — 화면·리포트가 어긋나지 않게 하려는 것.
    const cases = [true, false].flatMap((check) =>
      [true, false].flatMap((f1) =>
        [true, false].map((ref) =>
          aggregateCA(
            verdicts({
              f1_jargon: { pass: f1, unglossed_terms: [], evidence: "" },
              f2_refusal: {
                has_refusal: ref,
                account: false,
                alternative: false,
                mitigation: false,
                bald: ref,
                evidence: "",
              },
            }),
            check,
          ),
        ),
      ),
    );
    for (const r of cases) {
      assert.ok(r.score >= 0 && r.score <= r.applicable);
      assert.equal(r.grade, grade(r.score, r.applicable));
    }
  });
});
