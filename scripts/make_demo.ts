/**
 * make_demo.ts — 데모 시나리오를 실제 파이프라인으로 1회 실행해 결과를 저장한다.
 * 저장된 JSON은 `?replay=<name>` 으로 앱에서 그대로 재생된다(기술설명서 캡처·오프라인 시연용).
 *
 * 전제: `npm run dev`로 API(8787)가 떠 있을 것.
 * 실행: cd app && npx tsx scripts/make_demo.ts
 * 산출: public/demo/<name>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatResponse, SourceDoc } from "../server/lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/demo");
const API = process.env.DEMO_API ?? "http://localhost:8787/api/chat";

type Msg = { role: "user" | "assistant"; content: string };

/** 화면 재생용 메시지 — 어시스턴트 턴에는 출처 배지·repair 배지 정보가 붙는다. */
type DisplayMsg = Msg & { sources?: SourceDoc[]; repair?: ChatResponse["repair_mode"] };

/** 시나리오 = 사용자 발화 순서. 마지막 턴의 응답이 품질 패널에 표시된다. */
const SCENARIOS: { name: string; label: string; turns: string[] }[] = [
  {
    name: "insurance",
    label: "분쟁 — 보험 고지의무 위반 해지",
    turns: ["보험 가입할 때 예전에 병원 다닌 걸 말 안 했는데 보험금 못 준다고 해요. 이게 맞나요?"],
  },
  {
    name: "repair",
    label: "복구 — 암묵 신호 감지 후 이해확인(1단계 repair)",
    turns: ["적금 월 납입금 좀 낮출 수 있나요?", "아 네... 근데 그게 좀..."],
  },
  {
    name: "loan",
    label: "업무 — 금리인하요구권 거절",
    turns: ["연봉이 올라서 금리 낮춰달라고 했는데 은행이 안 된대요. 그냥 받아들여야 하나요?"],
  },
];

async function send(message: string, history: Msg[]): Promise<ChatResponse> {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as ChatResponse;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const sc of SCENARIOS) {
  const history: Msg[] = [];
  const messages: DisplayMsg[] = [];
  let last: ChatResponse | null = null;
  for (const turn of sc.turns) {
    messages.push({ role: "user", content: turn });
    const res = await send(turn, [...history]);
    history.push({ role: "user", content: turn }, { role: "assistant", content: res.reply });
    messages.push({
      role: "assistant",
      content: res.reply,
      sources: res.sources,
      repair: res.repair_mode,
    });
    last = res;
  }
  if (!last) throw new Error(`${sc.name}: 응답이 없습니다`);
  const out = { name: sc.name, label: sc.label, messages, response: last };
  fs.writeFileSync(path.join(OUT_DIR, `${sc.name}.json`), JSON.stringify(out, null, 2));
  console.log(
    `✅ ${sc.name} — 등급 ${last.ca?.grade ?? "-"} · repair=${last.repair_mode} · 출처 ${last.sources?.length ?? 0}건`,
  );
}
console.log(`\n저장 위치: ${OUT_DIR}`);
