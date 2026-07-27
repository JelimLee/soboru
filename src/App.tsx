import { useState } from "react";
import Chat from "./components/Chat";
import QualityPanel from "./components/QualityPanel";
import type { ChatResponse } from "./lib/types";

export default function App() {
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-xl font-bold">
          소보루{" "}
          <span className="text-sm font-normal text-slate-500">
            — 답변의 근거와 품질을 스스로 증명하는 금융 소비자 보호 에이전트
          </span>
        </h1>
      </header>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <Chat onResponse={setLastResponse} />
        </section>
        <aside>
          <QualityPanel response={lastResponse} />
        </aside>
      </main>
    </div>
  );
}
