import type { ChatMessage, ClassifyResult, RepairMode } from "./types";

/** 명시 신호 — 설명이 통하지 않았다는 직접 증거. 전면 재설명. */
const FULL_REPAIR_SIGNALS = ["lack_of_understanding", "explicit_dissatisfaction"];
/** 암묵 신호 — 문제의 조짐. 단정 대신 이해확인 질문으로 trouble-source를 특정. */
const CHECK_SIGNALS = ["hesitation", "conditional_acceptance"];

/**
 * 2단계 repair 판정 — CA의 repair initiation은 단계적이라는 원칙을 제품화.
 * 수용(acceptance)에는 아무것도 발동하지 않는다 — ACCEPT는 시퀀스를 닫는 자리이지 문제 신호가 아니다.
 */
export function decideRepairMode(
  signal: ClassifyResult["dispreferred_signal"],
  history: ChatMessage[],
): RepairMode {
  // 직전 assistant 답변이 없으면 repair 대상 자체가 없다(첫 턴)
  if (!history.some((m) => m.role === "assistant")) return "none";
  if (FULL_REPAIR_SIGNALS.includes(signal)) return "full";
  if (CHECK_SIGNALS.includes(signal)) return "check";
  return "none"; // none · acceptance
}
