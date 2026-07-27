import type { CAReport, ChatResponse, RepairMode } from "../lib/types";

const GRADE_COLOR: Record<string, string> = {
  A: "bg-emerald-500", B: "bg-lime-500", C: "bg-amber-500", D: "bg-red-500",
};

function CAPanel({ ca, turnType }: { ca: CAReport; turnType: RepairMode }) {
  const f2 = ca.f2_refusal;
  // 이해확인 턴은 설명을 제공하는 턴이 아니므로 F1·F6이 구조적으로 미적용 (caverify 집계와 동일 규칙)
  const isCheckTurn = turnType === "check";
  const u = ca.f4_understanding;
  // F 차원별 표시 상태: pass / fail / na — 각 차원을 금소법 §19(설명의무) 언어로 표기,
  // 판정 루브릭 자체는 CA(repair·preference) 방법론에서 조작화 (docs/06 참조)
  const dims: { key: string; label: string; basis: string; state: "pass" | "fail" | "na"; detail?: string; evidence?: string }[] = [
    {
      key: "F1", label: "용어 풀이", basis: "§19 이해가능한 설명",
      state: isCheckTurn ? "na" : ca.f1_jargon.pass ? "pass" : "fail",
      detail: isCheckTurn
        ? "설명 턴 아님 — 미적용"
        : ca.f1_jargon.unglossed_terms.length ? `미풀이: ${ca.f1_jargon.unglossed_terms.join(", ")}` : undefined,
      evidence: isCheckTurn ? undefined : ca.f1_jargon.evidence,
    },
    {
      key: "F2", label: "거절 응대", basis: "민원·분쟁 전조 감지", state: !f2.has_refusal ? "na" : f2.bald ? "fail" : "pass",
      detail: f2.has_refusal ? `이유 ${f2.account ? "○" : "✕"} · 대안 ${f2.alternative ? "○" : "✕"} · 완화 ${f2.mitigation ? "○" : "✕"}${f2.bald ? "  ← 맨살거절" : ""}` : "거절 없음",
      evidence: f2.evidence,
    },
    {
      // 점수 집계와 동일 규칙: 이해확인이 있으면 pass, 이해확인 없이 용건확인만으로 종결하면 fail,
      // 종결 턴이 아니면 미적용. (understanding_check 단독으로 ❌를 띄우면 등급과 어긋난다)
      key: "F4", label: "이해확인", basis: "§19 이해 여부 확인",
      state: u.understanding_check ? "pass" : u.pre_closing_only ? "fail" : "na",
      detail: u.understanding_check
        ? undefined
        : u.pre_closing_only ? "용건확인만(PRE-CLOSING) — 이해확인 부재" : "종결 턴 아님 — 미적용",
      evidence: u.evidence,
    },
    {
      key: "F6", label: "중요사항 고지", basis: "§19 비용·불이익 설명",
      state: isCheckTurn || !ca.f6_disclosure.applicable ? "na" : ca.f6_disclosure.disclosed ? "pass" : "fail",
      detail: isCheckTurn
        ? "설명 턴 아님 — 미적용"
        : ca.f6_disclosure.missing.length ? `누락: ${ca.f6_disclosure.missing.join(", ")}` : (ca.f6_disclosure.applicable ? undefined : "고지 대상 없음"),
      evidence: isCheckTurn ? undefined : ca.f6_disclosure.evidence,
    },
  ];
  const mark = (s: string) => (s === "pass" ? "✅" : s === "fail" ? "❌" : "—");
  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-indigo-900">설명의무 이행 검증 <span className="text-xs font-normal text-indigo-400">금소법 §19 · CA 방법론 기반</span></h2>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${GRADE_COLOR[ca.grade]}`}>{ca.grade}</span>
      </div>
      <p className="mb-3 text-xs text-slate-600">{ca.summary}</p>
      <div className="space-y-2">
        {dims.map((d) => (
          <div key={d.key} className={`rounded-lg border p-2 ${d.state === "fail" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
            <div className="flex justify-between">
              <span className="font-medium text-slate-700">
                {mark(d.state)} <b>{d.key}</b> {d.label}{" "}
                <span className="text-xs font-normal text-slate-400">{d.basis}</span>
              </span>
              {d.detail && <span className={`text-xs ${d.state === "fail" ? "font-semibold text-red-600" : "text-slate-500"}`}>{d.detail}</span>}
            </div>
            {d.evidence && <div className="mt-1 text-xs italic text-slate-400">“{d.evidence}”</div>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-right text-xs text-indigo-400">점수 {ca.score}/{ca.applicable} (적용 차원 중 통과)</p>
    </div>
  );
}

const SIGNAL_LABEL: Record<string, string> = {
  none: "없음",
  acceptance: "수용·종결 (accept)",
  hesitation: "머뭇거림 (hesitation)",
  conditional_acceptance: "조건부 수용",
  explicit_dissatisfaction: "명시적 불만",
  lack_of_understanding: "미이해 신호",
};

const CATEGORY_LABEL: Record<string, string> = {
  simple_inquiry: "단순 문의",
  complaint: "민원",
  dispute: "분쟁",
  out_of_scope: "범위 외",
};

export default function QualityPanel({ response }: { response: ChatResponse | null }) {
  if (!response) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-slate-400">
        <h2 className="mb-2 font-semibold text-slate-700">품질 패널</h2>
        답변이 생성되면 이곳에 품질 판정 결과가 표시됩니다.
        <p className="mt-3 text-xs">
          이 패널이 이 서비스의 차별화 축입니다: 답변을 생성한 모델이 아닌{" "}
          <b>별도의 맹검 평가 에이전트</b>가 출처 커버리지·설명 전략·용어 난이도를 재판정합니다.
        </p>
      </div>
    );
  }

  const q = response.quality;
  const c = response.classify;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="mb-3 font-semibold text-slate-700">문의 이해</h2>
        <Row label="유형" value={CATEGORY_LABEL[c.category] ?? c.category} />
        <Row label="핵심 키워드" value={c.keywords.join(", ") || "—"} />
        <Row
          label="불만족·미이해 신호"
          value={SIGNAL_LABEL[c.dispreferred_signal] ?? c.dispreferred_signal}
          highlight={c.dispreferred_signal !== "none"}
        />
        {response.repair_mode === "check" && (
          <p className="mt-2 rounded bg-indigo-50 p-2 text-xs text-indigo-700">
            <b>1단계 — 이해확인:</b> 암묵 신호(머뭇거림·조건부 수용)를 감지해, 단정하지 않고
            어느 부분이 걸렸는지 되물었습니다.
          </p>
        )}
        {response.repair_mode === "full" && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
            <b>2단계 — 재설명(repair):</b> 명시 신호(미이해·불만)를 감지해 직전 답변을 더 쉬운
            설명으로 재구성했습니다.
          </p>
        )}
      </div>

      {response.ca && <CAPanel ca={response.ca} turnType={response.repair_mode} />}

      <div className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="mb-3 font-semibold text-slate-700">근거성 판정 (맹검)</h2>
        {!q ? (
          <p className="text-slate-400">판정 결과 없음</p>
        ) : (
          <>
            <Row
              label="출처 커버리지"
              value={`${Math.round(q.source_coverage * 100)}%`}
              highlight={q.source_coverage < 0.7}
            />
            <div className="my-2 h-2 w-full rounded bg-slate-100">
              <div
                className={`h-2 rounded ${q.source_coverage >= 0.7 ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${Math.round(q.source_coverage * 100)}%` }}
              />
            </div>
            <Row label="용어 난이도" value={q.term_difficulty === "easy" ? "쉬움" : q.term_difficulty === "moderate" ? "보통" : "어려움"} />
            <Row label="사례 설명(EX)" value={q.strategies.example_used ? "사용" : "미사용"} />
            <Row label="비교 설명(CM)" value={q.strategies.comparison_used ? "사용" : "미사용"} />
            <Row
              label="종합 판정"
              value={q.verdict === "grounded" ? "✅ 근거 충분" : q.verdict === "partial" ? "⚠️ 부분 근거" : "❌ 근거 부족"}
            />
            {q.unsupported_claims.length > 0 && (
              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                <b>확인 필요 문장:</b>
                <ul className="ml-4 list-disc">
                  {q.unsupported_claims.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {response.mock && (
        <p className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-400">
          ⚠️ MOCK 모드 — .env에 OPENAI_API_KEY를 설정하면 실제 에이전트가 동작합니다.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={highlight ? "font-semibold text-amber-600" : "font-medium"}>{value}</span>
    </div>
  );
}
