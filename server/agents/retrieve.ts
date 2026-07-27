import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { supabase } from "../lib/supabase";
import type { SourceDoc } from "../lib/types";

// TODO(임베딩): 현재는 키워드 매칭. pgvector 유사도 검색으로 업그레이드하려면
// 임베딩 모델이 필요함 — 후보: OpenAI text-embedding-3-small, Supabase 내장 gte-small.
// 여담 파이프라인 결정과 통일할 것.
// 데모 코퍼스 30~50건 규모에서는 키워드 매칭으로도 충분히 동작한다.

const here = dirname(fileURLToPath(import.meta.url));

function loadLocalDocs(): SourceDoc[] {
  const raw = readFileSync(join(here, "../../data/documents.jsonl"), "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SourceDoc);
}

/**
 * classify는 "병력 미고지", "만기 전" 같은 구(句)를 내놓는다. 구 전체를 substring 매칭하면
 * 문서에 그대로 등장할 일이 없어 검색이 헛돈다 → 토큰으로 쪼개 매칭한다.
 * 1글자 토큰은 아무 문서에나 걸리므로 제외.
 */
function tokenize(keywords: string[]): string[] {
  const tokens = keywords.flatMap((k) => k.split(/\s+/)).filter((t) => t.length >= 2);
  return [...new Set(tokens)];
}

function keywordMatch(docs: SourceDoc[], keywords: string[]): SourceDoc[] {
  const tokens = tokenize(keywords);
  if (tokens.length === 0) return [];
  return docs
    .map((d) => ({
      doc: d,
      // 제목 일치에 가중치 2 — 제목은 그 문서의 주제어라 본문 우연 일치보다 신호가 강하다
      score: tokens.reduce(
        (n, t) => n + (d.title.includes(t) ? 2 : 0) + (d.content.includes(t) ? 1 : 0),
        0,
      ),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.doc);
}

export async function retrieve(keywords: string[]): Promise<SourceDoc[]> {
  if (keywords.length === 0) return [];

  // Supabase 연결 시: DB에서 키워드 매칭
  if (supabase) {
    const orFilter = tokenize(keywords)
      .flatMap((t) => [`title.ilike.%${t}%`, `content.ilike.%${t}%`])
      .join(",");
    const { data, error } = await supabase
      .from("documents")
      .select("id, doc_type, title, content, source_url")
      .or(orFilter)
      .limit(5);
    if (error) {
      // 테이블 미생성·연결 오류 등: 로컬 시드로 폴백해 데모가 끊기지 않게 한다.
      // (schema.sql 실행 + npm run ingest 완료 후에는 이 경로로 빠지지 않음)
      console.error("[retrieve] supabase error → 로컬 폴백:", error.message);
      return keywordMatch(loadLocalDocs(), keywords);
    }
    return (data ?? []) as SourceDoc[];
  }

  // Supabase 미설정: 로컬 목데이터에서 키워드 매칭
  return keywordMatch(loadLocalDocs(), keywords);
}
