/**
 * data/documents.jsonl → Supabase documents 테이블 적재
 * 실행: npm run ingest  (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요)
 *
 * 콘텐츠 파이프라인 (여담 구조 이식):
 *   공개 자료 수집 → 요약·출처 태깅 (수기 또는 LLM 보조) → jsonl 작성 → 본 스크립트로 적재
 * ⚠️ 수집 전 각 출처의 이용약관·공공누리 표시 확인. 실명 등 개인정보 포함 사례 사용 금지.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정하세요 (.env)");
  process.exit(1);
}
const supabase = createClient(url, key);

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "../data/documents.jsonl"), "utf-8");
const docs = raw
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const { error } = await supabase
  .from("documents")
  .insert(docs.map(({ id: _id, ...rest }) => rest));

if (error) {
  console.error("적재 실패:", error.message);
  process.exit(1);
}
console.log(`✅ ${docs.length}건 적재 완료`);
