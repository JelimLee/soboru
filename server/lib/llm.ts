import OpenAI from "openai";

// 모델 티어 분리 (비용·정밀도 분리 운용):
//   생성 = 상위 모델 / 분류·판정 = mini 모델
// 다른 모델로 바꾸려면 이 두 줄만 수정 (gpt-4o, gpt-4o-mini, gpt-5 등).
export const GENERATION_MODEL = "gpt-4.1";
export const JUDGE_MODEL = "gpt-4.1-mini";

export const MOCK_MODE = !process.env.OPENAI_API_KEY;

// OPENAI_API_KEY 환경변수를 SDK가 자동으로 읽는다.
export const openai = MOCK_MODE ? null : new OpenAI();

/** 구조화 출력(JSON) 응답 본문을 파싱 */
export function parseJson<T>(content: string | null): T {
  if (!content) throw new Error("빈 응답 (구조화 출력 없음)");
  return JSON.parse(content) as T;
}
