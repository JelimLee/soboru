/**
 * ca_code.ts — 원본 금융상담 대화에 CA 기반 소비자보호 실패모드(F1~F6) 코딩
 *
 * 실행:  cd app && npx tsx --env-file-if-exists=.env scripts/ca_code.ts [표본수=40]
 * 산출:  data/ca/coded.jsonl  (케이스별 코딩)
 *        data/ca/stats.json   (상황·차원별 집계)
 *        data/ca/report.html  (눈으로 보는 케이스별 리포트)
 *
 * 판정기: gpt-4.1-mini (JUDGE_MODEL). CA 이론(repair/preference)으로 정의한 6개 차원.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "../data/ca/raw");
const OUT_DIR = path.join(__dirname, "../data/ca");
const MODEL = "gpt-4.1-mini";
const SAMPLE_N = Number(process.argv[2] ?? 40);
const CONCURRENCY = 5;

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY 없음 — .env 확인. (MOCK로는 CA 코딩 불가)");
  process.exit(1);
}
const openai = new OpenAI();

// ── F1~F6 차원 정의 (docs/06_CA_RAG_설계.md §2) ─────────────────────────────
const DIMS = [
  { id: "F1", label: "용어 방치(미수정 trouble-source)", desc: "고객이 이해하기 어려운 금융용어를 평이한 설명(gloss) 없이 사용했는가" },
  { id: "F2", label: "맨살 거절(preference 위반)", desc: "요청을 거절/불가 안내하면서 이유(account)나 대안(alternative) 없이 통보했는가" },
  { id: "F3", label: "본인확인 삽입 과부하", desc: "본 요청 처리 전 본인확인/계좌확인 등 삽입 요구가 과도했는가 (insertion_count로 계량)" },
  { id: "F4", label: "이해확인 부재", desc: "안내 후 고객이 이해했는지 확인하거나 추가 질문을 유도하지 않고 종결했는가" },
  { id: "F5", label: "repair 미완결", desc: "고객이 재질문/혼란으로 개시한 문제(other-initiation)가 끝내 해소되지 않았는가" },
  { id: "F6", label: "고지의무 누락", desc: "결부된 비용/수수료/불이익/소요기한/리스크 등 고지가 필요한데 언급하지 않았는가" },
] as const;

const SYSTEM = `당신은 대화분석(Conversation Analysis) 전문 코더다. 금융 고객상담 대화를 Schegloff/Pomerantz의 repair·preference 이론으로 코딩한다.
대화 표기: "TX"=상담사 발화, "RX"=고객 발화. ★●■ 등은 비식별 마스킹이다.
아래 6개 실패모드 각각에 대해 verdict를 매긴다.
- "fail" = 소비자보호 실패가 실제로 존재
- "pass" = 실패 없음(잘 처리)
- "na"  = 해당 차원이 이 대화엔 적용되지 않음(예: 거절 자체가 없으면 F2=na, 고지할 항목이 없으면 F6=na)
evidence는 반드시 대화 원문에서 그대로 인용(없으면 ""). rationale는 한국어 한 문장.
과도하게 관대하지 말 것: 애매하면 실제 신호에 근거해 판정하고, 신호가 없으면 na.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["case_summary", "dimensions"],
  properties: {
    case_summary: { type: "string", description: "이 상담을 소비자보호 관점에서 1문장 요약" },
    dimensions: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "evidence", "rationale", "insertion_count"],
        properties: {
          id: { type: "string", enum: ["F1", "F2", "F3", "F4", "F5", "F6"] },
          verdict: { type: "string", enum: ["pass", "fail", "na"] },
          evidence: { type: "string" },
          rationale: { type: "string" },
          insertion_count: { type: "integer", description: "F3에서만 의미(본인/계좌확인 삽입 횟수), 그 외 0" },
        },
      },
    },
  },
} as const;

type Coded = {
  case_summary: string;
  dimensions: { id: string; verdict: "pass" | "fail" | "na"; evidence: string; rationale: string; insertion_count: number }[];
};

// ── 표본 추출: 상황별 결정론적 균등 샘플 ─────────────────────────────────────
function loadSample(n: number) {
  const files: string[] = [];
  for (const d of fs.readdirSync(RAW_DIR)) {
    const p = path.join(RAW_DIR, d);
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) if (f.endsWith(".json")) files.push(path.join(p, f));
  }
  const byS: Record<string, any[]> = { 업무처리: [], 일반문의: [], 민원응대: [] };
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      const sit = j.qa_data?.[0]?.consulting_situation ?? "업무처리";
      (byS[sit] ??= []).push({ f, j });
    } catch {}
  }
  // 결정론적: source_id 정렬 후 균등 간격
  const pick = (arr: any[], k: number) => {
    arr.sort((a, b) => (a.j.source?.source_id ?? "").localeCompare(b.j.source?.source_id ?? ""));
    if (arr.length <= k) return arr;
    const step = arr.length / k;
    return Array.from({ length: k }, (_, i) => arr[Math.floor(i * step)]);
  };
  // 민원은 희소 → 최소 10 보장, 나머지는 업무처리/일반문의 비율
  const nMinwon = Math.min(10, byS["민원응대"].length, Math.round(n * 0.25));
  const rest = n - nMinwon;
  const nWork = Math.round(rest * 0.6);
  const nGen = rest - nWork;
  return [...pick(byS["업무처리"], nWork), ...pick(byS["일반문의"], nGen), ...pick(byS["민원응대"], nMinwon)];
}

async function codeOne(item: any): Promise<any> {
  const j = item.j;
  const s = j.source ?? {};
  const c = j.consulting ?? {};
  const qa = j.qa_data?.[0] ?? {};
  const user = `[상담 메타] 분야=${c.consulting_category} / 주제=${c.consulting_topic} / 상황=${qa.consulting_situation} / 고객연령=${s.client_age} / 핵심용어=${qa.core_financial_terms}
[상담 요약] ${c.consulting_summary}
[고객 후속질문(있으면)] ${qa.input?.follow_up_question ?? "(없음)"}

[원본 대화 전문]
${s.consulting_content}

위 대화를 F1~F6으로 코딩하라.`;
  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: "ca_coding", strict: true, schema: schema as any } },
  });
  const coded = JSON.parse(resp.choices[0].message.content!) as Coded;
  return {
    source_id: s.source_id,
    topic: c.consulting_topic,
    situation: qa.consulting_situation,
    age: s.client_age,
    core_terms: qa.core_financial_terms,
    summary: c.consulting_summary,
    content: s.consulting_content,
    followup: qa.input?.follow_up_question ?? "",
    case_summary: coded.case_summary,
    dims: coded.dimensions,
  };
}

async function pool<T>(items: any[], k: number, fn: (x: any) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: k }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { out[idx] = await fn(items[idx]); process.stdout.write("."); }
        catch (e: any) { process.stdout.write("x"); out[idx] = { error: String(e?.message ?? e), source_id: items[idx].j.source?.source_id } as any; }
      }
    })
  );
  return out;
}

function aggregate(rows: any[]) {
  const sits = ["업무처리", "일반문의", "민원응대"];
  const stat: any = { n: rows.length, by_dim: {}, by_situation: {} };
  for (const d of DIMS) {
    let fail = 0, applicable = 0;
    for (const r of rows) {
      const dim = r.dims?.find((x: any) => x.id === d.id);
      if (!dim || dim.verdict === "na") continue;
      applicable++; if (dim.verdict === "fail") fail++;
    }
    stat.by_dim[d.id] = { label: d.label, fail, applicable, fail_rate: applicable ? +(fail / applicable * 100).toFixed(1) : null };
  }
  for (const sit of sits) {
    const sub = rows.filter((r) => r.situation === sit);
    const dd: any = {};
    for (const d of DIMS) {
      let fail = 0, app = 0;
      for (const r of sub) { const x = r.dims?.find((y: any) => y.id === d.id); if (!x || x.verdict === "na") continue; app++; if (x.verdict === "fail") fail++; }
      dd[d.id] = app ? +(fail / app * 100).toFixed(0) : null;
    }
    stat.by_situation[sit] = { n: sub.length, fail_rate_pct: dd };
  }
  return stat;
}

function renderHtml(rows: any[], stat: any): string {
  const badge = (v: string) => v === "fail" ? `<span style="background:#fce4e4;color:#b3261e;padding:1px 7px;border-radius:10px;font-weight:600">FAIL</span>`
    : v === "pass" ? `<span style="background:#e3f3e6;color:#1e7a34;padding:1px 7px;border-radius:10px">pass</span>`
    : `<span style="background:#eee;color:#777;padding:1px 7px;border-radius:10px">n/a</span>`;
  const dimLabel: any = Object.fromEntries(DIMS.map((d) => [d.id, d.label]));
  const statRows = DIMS.map((d) => { const s = stat.by_dim[d.id]; return `<tr><td><b>${d.id}</b> ${d.label}</td><td style="text-align:right">${s.fail}/${s.applicable}</td><td style="text-align:right;font-weight:700;color:${(s.fail_rate ?? 0) >= 40 ? "#b3261e" : "#333"}">${s.fail_rate ?? "-"}%</td></tr>`; }).join("");
  const sitRows = Object.entries(stat.by_situation).map(([sit, v]: any) => `<tr><td>${sit} (n=${v.n})</td>${DIMS.map((d) => `<td style="text-align:center">${v.fail_rate_pct[d.id] ?? "-"}</td>`).join("")}</tr>`).join("");
  const cards = rows.filter((r) => !r.error).map((r, i) => {
    const dimHtml = r.dims.map((d: any) => `<div style="margin:6px 0"><div>${badge(d.verdict)} <b>${d.id}</b> ${dimLabel[d.id]}${d.id === "F3" && d.insertion_count ? ` <span style="color:#888">(삽입 ${d.insertion_count}회)</span>` : ""}</div>${d.evidence ? `<div style="color:#555;font-size:13px;margin:2px 0 0 4px">근거: “${d.evidence}”</div>` : ""}<div style="color:#777;font-size:13px;margin-left:4px">${d.rationale}</div></div>`).join("");
    const fails = r.dims.filter((d: any) => d.verdict === "fail").map((d: any) => d.id).join(", ") || "없음";
    return `<details style="border:1px solid #e2e2e2;border-radius:10px;margin:10px 0;padding:10px 14px" ${i < 3 ? "open" : ""}>
      <summary style="cursor:pointer;font-weight:600">#${i + 1} · ${r.situation} · ${r.topic} · ${r.age} <span style="color:#b3261e">[실패: ${fails}]</span></summary>
      <p style="color:#333;margin:8px 0"><b>케이스:</b> ${r.case_summary}</p>
      ${dimHtml}
      <details style="margin-top:8px"><summary style="cursor:pointer;color:#666">원본 대화 보기</summary><pre style="white-space:pre-wrap;font-size:12.5px;color:#444;background:#fafafa;padding:10px;border-radius:6px">${(r.content || "").replace(/</g, "&lt;")}</pre></details>
    </details>`;
  }).join("");
  return `<!doctype html><meta charset=utf8><title>CA 소비자보호 코딩 리포트</title>
<body style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1a1a1a">
<h1>CA 기반 소비자보호 실패모드 코딩 (원본 상담 ${stat.n}건)</h1>
<p style="color:#666">판정기 gpt-4.1-mini · 검증셋 은행 · docs/06_CA_RAG_설계.md §2 기준</p>
<h2>차원별 실패율 (적용 가능 케이스 중)</h2>
<table style="border-collapse:collapse;width:100%"><tr style="border-bottom:2px solid #333"><th align=left>실패모드</th><th align=right>fail/적용</th><th align=right>실패율</th></tr>${statRows}</table>
<h2 style="margin-top:24px">상황별 실패율(%)</h2>
<table style="border-collapse:collapse;width:100%"><tr style="border-bottom:2px solid #333"><th align=left>상황</th>${DIMS.map((d) => `<th>${d.id}</th>`).join("")}</tr>${sitRows}</table>
<h2 style="margin-top:24px">케이스별 상세</h2>${cards}
</body>`;
}

(async () => {
  console.log(`표본 ${SAMPLE_N}건 로딩...`);
  const sample = loadSample(SAMPLE_N);
  console.log(`코딩 시작 (${sample.length}건, ${MODEL})`);
  const rows = await pool(sample, CONCURRENCY, codeOne);
  console.log("");
  const ok = rows.filter((r: any) => !r.error);
  const stat = aggregate(ok);
  fs.writeFileSync(path.join(OUT_DIR, "coded.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n"));
  fs.writeFileSync(path.join(OUT_DIR, "stats.json"), JSON.stringify(stat, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "report.html"), renderHtml(ok, stat));
  console.log(`\n=== 차원별 실패율 (n=${stat.n}) ===`);
  for (const d of DIMS) { const s = stat.by_dim[d.id]; console.log(`  ${d.id} ${d.label.padEnd(22)} ${String(s.fail_rate ?? "-").padStart(5)}%  (${s.fail}/${s.applicable})`); }
  console.log(`\n산출: data/ca/report.html · coded.jsonl · stats.json`);
  if (rows.some((r: any) => r.error)) console.log(`(에러 ${rows.filter((r: any) => r.error).length}건)`);
})();
