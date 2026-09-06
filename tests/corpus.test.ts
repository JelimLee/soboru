import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocType, SourceDoc } from "../server/lib/types";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "../data/documents.jsonl");
const DOC_TYPES: DocType[] = ["law", "case", "faq", "term"];

const lines = readFileSync(CORPUS, "utf-8").split("\n").filter((l) => l.trim());

describe("data/documents.jsonl — 코퍼스 무결성", () => {
  test("모든 줄이 JSON 1건으로 파싱된다", () => {
    for (const [i, line] of lines.entries()) {
      assert.doesNotThrow(() => JSON.parse(line), `${i + 1}번째 줄 파싱 실패`);
    }
  });

  const docs = lines.map((l) => JSON.parse(l) as SourceDoc);

  test("필수 필드가 모두 있고 비어 있지 않다", () => {
    for (const d of docs) {
      for (const k of ["id", "doc_type", "title", "content"] as const) {
        assert.ok(typeof d[k] === "string" && d[k].length > 0, `${d.id}: ${k} 누락`);
      }
    }
  });

  test("doc_type이 허용된 4종 안에 있다", () => {
    for (const d of docs) assert.ok(DOC_TYPES.includes(d.doc_type), `${d.id}: ${d.doc_type}`);
  });

  test("id가 중복되지 않는다 — 출처 배지가 key로 쓴다", () => {
    assert.equal(new Set(docs.map((d) => d.id)).size, docs.length);
  });

  test("모든 문서에 출처 URL이 있다 — 근거 없는 문서는 인용될 수 없다", () => {
    for (const d of docs) {
      assert.ok(d.source_url && d.source_url.startsWith("http"), `${d.id}: source_url 없음`);
    }
  });

  test("코퍼스 구성이 문서에 적힌 수치와 일치한다 (README·CORPUS_SOURCES.md)", () => {
    // README가 "공개자료 45건(분쟁유형 21·FAQ 11·용어 7·법령 6)"이라고 밝히고 있다.
    // 코퍼스를 늘리거나 줄이면 이 테스트가 먼저 깨져서 문서를 같이 고치게 된다.
    const by = Object.fromEntries(DOC_TYPES.map((t) => [t, docs.filter((d) => d.doc_type === t).length]));
    assert.deepEqual(by, { law: 6, case: 21, faq: 11, term: 7 });
    assert.equal(docs.length, 45);
  });

  test("개인 식별 정보로 보이는 패턴이 본문에 없다", () => {
    // case는 특정 사건이 아니라 일반화된 분쟁 유형 설명이어야 한다.
    const patterns: [RegExp, string][] = [
      [/\d{6}\s*-\s*\d{7}/, "주민등록번호 형태"],
      [/\d{2,3}-\d{3,4}-\d{4}/, "전화번호 형태"],
      [/[\w.+-]+@[\w-]+\.[\w.]+/, "이메일 주소"],
    ];
    for (const d of docs) {
      for (const [re, label] of patterns) {
        assert.ok(!re.test(d.content), `${d.id}: ${label}로 보이는 문자열`);
      }
    }
  });
});
