import type { ChatMessage, ChatResponse } from "./types";

export async function sendChat(
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    // 서버는 {error: "..."} 형태로 사유를 준다(예: 429 이용 한도). 사용자에게 그 문장을 그대로 보여준다.
    const body = await res.text();
    let message = `API ${res.status}: ${body}`;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // JSON이 아니면 원문 유지
    }
    throw new Error(message);
  }
  return res.json();
}
