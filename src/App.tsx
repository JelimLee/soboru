import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import QualityPanel from "./components/QualityPanel";
import type { ChatResponse } from "./lib/types";

/**
 * `?replay=<name>` 이면 `public/demo/<name>.json`(실제 파이프라인 1회 실행 결과)을 그대로 띄운다.
 * API 키 없이도 심사자가 결과를 볼 수 있게 하고, 기술설명서 캡처를 재현 가능하게 하기 위한 모드.
 * 생성 스크립트: `scripts/make_demo.ts`
 */
const replay = new URLSearchParams(window.location.search).get("replay");

export default function App() {
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);
  const [seed, setSeed] = useState<any[] | undefined>(undefined);
  const [ready, setReady] = useState(!replay);

  useEffect(() => {
    if (!replay) return;
    fetch(`/demo/${replay}.json`)
      .then((r) => r.json())
      .then((d) => {
        setSeed(d.messages);
        setLastResponse(d.response);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-xl font-bold">
          소보루{" "}
          <span className="text-sm font-normal text-slate-500">
            — 근거를 보여주고, 못 알아들으면 다시 설명하는 금융 소비자 보호 에이전트
          </span>
          {replay && (
            <span className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 align-middle text-xs font-normal text-slate-400">
              저장된 실행 결과 재생
            </span>
          )}
        </h1>
      </header>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <Chat onResponse={setLastResponse} seed={seed} />
        </section>
        <aside>
          <QualityPanel response={lastResponse} />
        </aside>
      </main>
    </div>
  );
}
