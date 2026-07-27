/**
 * ca_perturb.ts — 판별 타당성 테스트
 * 같은 상담을 (원본 gold) vs (F1/F2/F4/F6 위반 주입 버전)으로 만들어
 * 동일 CA 코더로 채점 → 실패율 대비. 루브릭·판정기의 판별력 검증.
 *
 * 실행: cd app && npx tsx --env-file-if-exists=.env scripts/ca_perturb.ts [N=8]
 * 산출: data/ca/perturb.json, data/ca/perturb.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "../data/ca/raw");
const OUT_DIR = path.join(__dirname, "../data/ca");
const N = Number(process.argv[2] ?? 8);
const openai = new OpenAI();
if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY 없음"); process.exit(1); }

const DIMS = ["F1", "F2", "F3", "F4", "F5", "F6"];
const CODER_SYSTEM = `당신은 대화분석(CA) 전문 코더다. 금융상담을 repair·preference 이론으로 코딩한다. TX=상담사, RX=고객.
6개 소비자보호 실패모드를 판정한다(fail=실패 실재, pass=양호, na=미적용):
F1 용어방치(금융용어를 평이한 설명 없이 사용) / F2 맨살거절(이유·대안 없이 거절) / F3 본인확인 삽입 과부하 / F4 이해확인 부재(이해 확인·추가질문 유도 없이 종결) / F5 repair 미완결(고객 재질문/혼란 미해소) / F6 고지의무 누락(비용·불이익·기한·리스크 미고지).
엄격하게 판정하라. evidence는 원문 인용, rationale는 한 문장.`;
const CODER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["dimensions"],
  properties: {
    dimensions: {
      type: "array", minItems: 6, maxItems: 6,
      items: {
        type: "object", additionalProperties: false, required: ["id", "verdict", "evidence", "rationale"],
        properties: {
          id: { type: "string", enum: DIMS }, verdict: { type: "string", enum: ["pass", "fail", "na"] },
          evidence: { type: "string" }, rationale: { type: "string" },
        },
      },
    },
  },
} as const;

const PERTURB_SYSTEM = `당신은 '저품질 상담'을 만드는 데이터 생성기다. 주어진 우수 상담 대화를 받아, 고객(RX) 발화는 그대로 두고 상담사(TX) 발화만 다음 결함을 갖도록 다시 써라:
- 금융용어를 풀어 설명하지 말 것(F1)
- 처리 불가/거절 시 이유와 대안을 빼고 무뚝뚝하게 통보할 것(F2)
- 이해 확인이나 추가 질문 유도 없이 끊을 것(F4)
- 수수료·기한·불이익 등 고지를 생략할 것(F6)
전체 상황과 흐름은 유지하되 응대 품질만 낮춰라. 같은 'TX/RX' 줄 형식으로만 출력하라.`;

async function code(content: string) {
  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini", temperature: 0,
    messages: [{ role: "system", content: CODER_SYSTEM }, { role: "user", content: `[대화]\n${content}\n\nF1~F6 코딩.` }],
    response_format: { type: "json_schema", json_schema: { name: "c", strict: true, schema: CODER_SCHEMA as any } },
  });
  return JSON.parse(r.choices[0].message.content!).dimensions as any[];
}
async function degrade(content: string) {
  const r = await openai.chat.completions.create({
    model: "gpt-4.1", temperature: 0.4,
    messages: [{ role: "system", content: PERTURB_SYSTEM }, { role: "user", content: content }],
  });
  return r.choices[0].message.content!;
}

function loadSample(n: number) {
  const files: string[] = [];
  for (const d of fs.readdirSync(RAW_DIR)) { const p = path.join(RAW_DIR, d); if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) if (f.endsWith(".json")) files.push(path.join(p, f)); }
  const items = files.map((f) => { try { return { f, j: JSON.parse(fs.readFileSync(f, "utf8")) }; } catch { return null; } }).filter(Boolean) as any[];
  items.sort((a, b) => (a.j.source?.source_id ?? "").localeCompare(b.j.source?.source_id ?? ""));
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

(async () => {
  const sample = loadSample(N);
  console.log(`판별 테스트: ${N}건 × (원본 vs 저품질 변형) 코딩...`);
  const results: any[] = [];
  for (const it of sample) {
    const content = it.j.source.consulting_content;
    const bad = await degrade(content);
    const [gGood, gBad] = await Promise.all([code(content), code(bad)]);
    results.push({ source_id: it.j.source.source_id, topic: it.j.consulting.consulting_topic, good: gGood, bad: gBad, bad_content: bad });
    process.stdout.write(".");
  }
  console.log("");
  // 집계
  const fails = (dims: any[]) => dims.filter((d) => d.verdict === "fail").map((d) => d.id);
  const tally = (key: "good" | "bad") => { const c: any = Object.fromEntries(DIMS.map((d) => [d, 0])); for (const r of results) for (const id of fails(r[key])) c[id]++; return c; };
  const g = tally("good"), b = tally("bad");
  console.log(`\n=== 실패 건수 (n=${N}) ===`);
  console.log(`     ${DIMS.map((d) => d.padStart(4)).join("")}`);
  console.log(`원본 ${DIMS.map((d) => String(g[d]).padStart(4)).join("")}`);
  console.log(`변형 ${DIMS.map((d) => String(b[d]).padStart(4)).join("")}`);
  fs.writeFileSync(path.join(OUT_DIR, "perturb.json"), JSON.stringify({ good: g, bad: b, results }, null, 2));
  // HTML
  const rowsHtml = results.map((r, i) => {
    const cell = (dims: any[]) => DIMS.map((id) => { const d = dims.find((x: any) => x.id === id); const v = d?.verdict; return `<td style="text-align:center;background:${v === "fail" ? "#fce4e4" : v === "pass" ? "#e8f5e9" : "#f0f0f0"}">${v === "fail" ? "F" : v === "pass" ? "·" : "-"}</td>`; }).join("");
    return `<tr><td>#${i + 1} ${r.topic}</td><td>원본</td>${cell(r.good)}</tr><tr><td></td><td>변형</td>${cell(r.bad)}</tr>`;
  }).join("");
  fs.writeFileSync(path.join(OUT_DIR, "perturb.html"), `<!doctype html><meta charset=utf8><title>판별 타당성</title><body style="font-family:sans-serif;max-width:760px;margin:24px auto">
<h1>CA 루브릭 판별 타당성 (원본 gold vs 저품질 변형)</h1>
<p>F=fail, ·=pass, -=na. 변형에서 F가 크게 늘면 루브릭·판정기가 품질차를 실제로 잡아낸다는 뜻.</p>
<table style="border-collapse:collapse;width:100%"><tr><th>케이스</th><th>버전</th>${DIMS.map((d) => `<th>${d}</th>`).join("")}</tr>${rowsHtml}</table>
<h3>합계 실패 건수</h3><table style="border-collapse:collapse"><tr><th></th>${DIMS.map((d) => `<th style="padding:4px 10px">${d}</th>`).join("")}</tr>
<tr><td>원본</td>${DIMS.map((d) => `<td style="text-align:center">${g[d]}</td>`).join("")}</tr>
<tr><td>변형</td>${DIMS.map((d) => `<td style="text-align:center;font-weight:700;color:#b3261e">${b[d]}</td>`).join("")}</tr></table></body>`);
  console.log(`\n산출: data/ca/perturb.html, perturb.json`);
})();
