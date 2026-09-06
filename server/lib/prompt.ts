import type { SourceDoc } from "./types";

/**
 * 검색된 근거 문서를 프롬프트에 넣을 `[출처 n]` 블록으로 직렬화한다.
 *
 * 생성(answer)과 판정(judge·caverify)이 **같은 번호로 같은 문서를 가리켜야** 판정이
 * 성립하므로, 세 에이전트가 이 함수 하나를 공유한다. 번호는 배열 순서 기준 1-based다.
 *
 * @param sources 검색 결과. 빈 배열이면 `emptyText`를 그대로 돌려준다.
 * @param includeDocType `[출처 1] (law) …`처럼 문서 종류를 함께 표기할지 여부.
 *   생성 단계는 법령/사례/FAQ에 따라 어투를 달리해야 해서 필요하고, 판정 단계는
 *   내용 대조만 하므로 불필요하다.
 * @param emptyText 근거가 없을 때 대신 넣을 문구. 단계마다 요구하는 대응이 달라
 *   호출부가 지정한다.
 */
export function formatSources(
  sources: SourceDoc[],
  { includeDocType = false, emptyText }: { includeDocType?: boolean; emptyText: string },
): string {
  if (sources.length === 0) return emptyText;
  return sources
    .map((s, i) => {
      const head = includeDocType
        ? `[출처 ${i + 1}] (${s.doc_type}) ${s.title}`
        : `[출처 ${i + 1}] ${s.title}`;
      return `${head}\n${s.content}`;
    })
    .join("\n\n");
}
