import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TOP_K, rankByKeyword, retrieve, tokenize } from "../server/agents/retrieve";
import type { DocType, SourceDoc } from "../server/lib/types";

function doc(id: string, title: string, content: string, doc_type: DocType = "faq"): SourceDoc {
  return { id, doc_type, title, content, source_url: null };
}

describe("tokenize — 구(句) 키워드를 토큰으로 분해", () => {
  test("공백으로 쪼갠다", () => {
    // classify는 "병력 미고지" 같은 구를 내놓는데, 구 전체는 문서에 그대로 등장하지
    // 않으므로 substring 매칭이 헛돈다.
    assert.deepEqual(tokenize(["병력 미고지"]), ["병력", "미고지"]);
  });

  test("1글자 토큰은 버린다 — 아무 문서에나 걸려 변별력이 없다", () => {
    assert.deepEqual(tokenize(["예 금리 인하"]), ["금리", "인하"]);
  });

  test("중복 토큰은 한 번만 센다", () => {
    assert.deepEqual(tokenize(["금리 인하", "금리 인상"]), ["금리", "인하", "인상"]);
  });

  test("빈 입력·공백만 있는 입력은 빈 배열", () => {
    assert.deepEqual(tokenize([]), []);
    assert.deepEqual(tokenize(["  "]), []);
  });
});

describe("rankByKeyword — 키워드 랭킹", () => {
  test("제목 일치가 본문 일치보다 위로 온다 (가중치 2 대 1)", () => {
    const docs = [doc("body", "다른 주제", "중도해지 이율 설명"), doc("title", "중도해지 이율", "무관")];
    assert.deepEqual(
      rankByKeyword(docs, ["중도해지"]).map((d) => d.id),
      ["title", "body"],
    );
  });

  test("여러 토큰이 걸린 문서가 한 토큰만 걸린 문서보다 위", () => {
    const docs = [doc("one", "가", "금리"), doc("two", "나", "금리 인하 요구권")];
    assert.equal(rankByKeyword(docs, ["금리 인하"])[0].id, "two");
  });

  test("한 토큰도 걸리지 않은 문서는 제외한다", () => {
    // 억지로 자리를 채우면 답변이 무관한 출처를 인용하게 된다.
    const docs = [doc("hit", "예금자보호", "한도 1억원"), doc("miss", "무관", "무관")];
    assert.deepEqual(
      rankByKeyword(docs, ["예금자보호"]).map((d) => d.id),
      ["hit"],
    );
  });

  test(`상위 ${TOP_K}건으로 자른다`, () => {
    const docs = Array.from({ length: TOP_K + 3 }, (_, i) => doc(`d${i}`, "금리", "금리"));
    assert.equal(rankByKeyword(docs, ["금리"]).length, TOP_K);
  });

  test("키워드가 없으면(또는 전부 1글자면) 빈 결과", () => {
    const docs = [doc("a", "금리", "금리")];
    assert.deepEqual(rankByKeyword(docs, []), []);
    assert.deepEqual(rankByKeyword(docs, ["금"]), []);
  });
});

describe("retrieve — Supabase 미설정 시 로컬 코퍼스 폴백", () => {
  // 환경변수가 없으면 supabase 클라이언트가 null이라 data/documents.jsonl을 읽는다.
  // 네트워크를 타지 않는 경로이므로 실제 코퍼스로 끝까지 검증한다.
  test("실제 코퍼스에서 관련 문서를 찾아 낸다", async () => {
    const hits = await retrieve(["예금자보호 한도"]);
    assert.ok(hits.length > 0, "예금자보호 관련 문서가 하나도 안 나오면 코퍼스나 랭킹이 깨진 것");
    assert.ok(hits.length <= TOP_K);
    assert.ok(hits.some((d) => d.title.includes("예금자보호")));
  });

  test("키워드가 비면 검색 자체를 하지 않는다", async () => {
    assert.deepEqual(await retrieve([]), []);
  });

  test("코퍼스에 없는 주제는 빈 결과 — 무관한 출처를 지어내지 않는다", async () => {
    assert.deepEqual(await retrieve(["짜장면 탕수육"]), []);
  });
});
