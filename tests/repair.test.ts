import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideRepairMode } from "../server/lib/repair";
import type { ChatMessage } from "../server/lib/types";

const FIRST_TURN: ChatMessage[] = [];
const AFTER_ANSWER: ChatMessage[] = [
  { role: "user", content: "적금 월 납입금 낮출 수 있나요?" },
  { role: "assistant", content: "적금은 가입 시 정한 금액을 유지해야 합니다." },
];

describe("decideRepairMode — 2단계 repair 트리거", () => {
  test("직전 assistant 답변이 없으면 어떤 신호든 발동하지 않는다", () => {
    // 첫 턴에는 고칠 대상(trouble-source)이 존재하지 않는다.
    for (const s of ["hesitation", "lack_of_understanding", "explicit_dissatisfaction"] as const) {
      assert.equal(decideRepairMode(s, FIRST_TURN), "none", s);
    }
  });

  test("명시 신호 → full (전면 재설명)", () => {
    assert.equal(decideRepairMode("lack_of_understanding", AFTER_ANSWER), "full");
    assert.equal(decideRepairMode("explicit_dissatisfaction", AFTER_ANSWER), "full");
  });

  test("암묵 신호 → check (이해확인 질문)", () => {
    assert.equal(decideRepairMode("hesitation", AFTER_ANSWER), "check");
    assert.equal(decideRepairMode("conditional_acceptance", AFTER_ANSWER), "check");
  });

  test("수용(acceptance)에는 발동하지 않는다 — ACCEPT는 시퀀스를 닫는 자리다", () => {
    // 이 프로젝트의 핵심 설계 판단. 감정 표현이 섞인 수용("ㅜㅜ 알겠습니다")을
    // 미이해로 오독해 재설명을 퍼붓는 것이 기존 시스템의 전형적 오발동이다.
    assert.equal(decideRepairMode("acceptance", AFTER_ANSWER), "none");
  });

  test("새 문의(none)에는 발동하지 않는다", () => {
    assert.equal(decideRepairMode("none", AFTER_ANSWER), "none");
  });

  test("user 발화만 있는 history는 첫 턴과 같게 취급한다", () => {
    const onlyUser: ChatMessage[] = [{ role: "user", content: "안녕하세요" }];
    assert.equal(decideRepairMode("hesitation", onlyUser), "none");
  });
});
