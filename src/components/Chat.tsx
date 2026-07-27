import { useState } from "react";
import { sendChat } from "../lib/api";
import type { ChatMessage, ChatResponse, RepairMode, SourceDoc } from "../lib/types";

interface Props {
  onResponse: (r: ChatResponse) => void;
}

interface DisplayMessage extends ChatMessage {
  sources?: SourceDoc[];
  repair?: RepairMode;
}

// 2단계 repair 배지 — check(암묵 신호)는 확인 질문, full(명시 신호)은 재설명
const REPAIR_BADGE: Record<Exclude<RepairMode, "none">, { text: string; className: string }> = {
  check: {
    text: "? 설명이 조금 복잡했던 것 같아 확인드려요",
    className: "text-indigo-600",
  },
  full: {
    text: "↻ 이해가 어려우셨던 것 같아 더 쉽게 다시 설명드려요",
    className: "text-amber-600",
  },
};

export default function Chat({ onResponse }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await sendChat(text, history);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.reply,
          sources: res.sources,
          repair: res.repair_mode,
        },
      ]);
      onResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[75vh] flex-col rounded-xl border bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-sm text-slate-400">
            금융 관련 문의나 민원 내용을 입력해보세요.
            <br />예: “적금을 만기 전에 해지하면 불이익이 있나요?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "border bg-slate-50 text-slate-900"
              }`}
            >
              {m.repair && m.repair !== "none" && (
                <span className={`mb-1 block text-xs font-semibold ${REPAIR_BADGE[m.repair].className}`}>
                  {REPAIR_BADGE[m.repair].text}
                </span>
              )}
              {m.content}
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.sources.map((s, j) => (
                  <a
                    key={s.id}
                    href={s.source_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100"
                    title={s.title}
                  >
                    출처 {j + 1} · {s.doc_type === "law" ? "법령" : s.doc_type === "case" ? "사례" : s.doc_type === "faq" ? "FAQ" : "용어"}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-slate-400">답변 생성 중…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="문의 내용을 입력하세요"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          전송
        </button>
      </div>
    </div>
  );
}
