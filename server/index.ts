import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { MOCK_MODE } from "./lib/llm";
import { classify } from "./agents/classify";
import { retrieve } from "./agents/retrieve";
import { answer } from "./agents/answer";
import { judge } from "./agents/judge";
import { caverify } from "./agents/caverify";
import {
  MOCK_CA,
  MOCK_CLASSIFY,
  MOCK_QUALITY,
  MOCK_REPLY,
  MOCK_SOURCES,
} from "./lib/mock";
import { decideRepairMode } from "./lib/repair";
import { createQuotaGuard } from "./lib/quota";
import type { ChatMessage, ChatResponse } from "./lib/types";

const app = express();
app.set("trust proxy", 1); // 배포 환경(프록시 뒤)에서 실제 클라이언트 IP를 쓰기 위함
app.use(cors());
app.use(express.json());

const quota = createQuotaGuard({
  perIpHourly: Number(process.env.RATE_LIMIT_PER_IP ?? 20),
  dailyTotal: Number(process.env.RATE_LIMIT_DAILY ?? 300),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mock: MOCK_MODE,
    daily_remaining: quota.dailyRemaining(),
  });
});

/**
 * 파이프라인: ① 문의 이해(mini) → ② 검색(키워드) → ③ 답변 생성(gpt-4.1)
 *            → ④ 품질 판정(mini, 맹검) — ③의 출력을 ④가 독립 재판정
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body as {
      message: string;
      history: ChatMessage[];
    };
    if (!message?.trim()) {
      res.status(400).json({ error: "message가 비어 있습니다" });
      return;
    }

    // 비용 가드 (MOCK 모드는 비용이 없으므로 면제)
    if (!MOCK_MODE) {
      const verdict = quota.check(req.ip ?? "unknown");
      if (!verdict.ok) {
        res.status(429).json({ error: verdict.reason });
        return;
      }
    }

    if (MOCK_MODE) {
      const mocked: ChatResponse = {
        reply: MOCK_REPLY,
        sources: MOCK_SOURCES,
        classify: MOCK_CLASSIFY,
        quality: MOCK_QUALITY,
        ca: MOCK_CA,
        repair_mode: "none",
        mock: true,
      };
      res.json(mocked);
      return;
    }

    // ① 문의 이해 + dispreferred 신호 감지
    const classifyResult = await classify(message, history);

    // repair 판정 (CA 근거): repair initiation은 단계적이다.
    // - 명시 신호 → full(전면 재설명)
    // - 암묵 신호 → check(이해확인 질문). 단정하지 않고 묻기 때문에 오판 비용이 낮다.
    // - 수용(acceptance)에는 아무것도 발동하지 않는다 — ACCEPT는 시퀀스를 닫는 자리.
    const repairMode = decideRepairMode(classifyResult.dispreferred_signal, history);

    // ② 근거 검색
    const sources = await retrieve(classifyResult.keywords);

    // ③ 답변 생성 (repair 모드 반영)
    const reply = await answer(message, history, sources, repairMode);

    // ④ 맹검 자가검증 (병렬) — 실패해도 답변은 반환 (판정은 부가 기능)
    //    judge=근거성(grounding) / caverify=CA 상호작용 품질(F1·F2·F4·F6)
    const [quality, ca] = await Promise.all([
      judge(message, reply, sources).catch((e) => {
        console.error("[judge] 판정 실패:", e);
        return null;
      }),
      caverify(message, reply, sources, repairMode).catch((e) => {
        console.error("[caverify] 판정 실패:", e);
        return null;
      }),
    ]);

    const payload: ChatResponse = {
      reply,
      sources,
      classify: classifyResult,
      quality,
      ca,
      repair_mode: repairMode,
      mock: false,
    };
    res.json(payload);
  } catch (e) {
    console.error("[chat] 오류:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "서버 오류" });
  }
});

/**
 * 배포 시: 빌드된 프론트(dist/)를 같은 서버가 서빙한다 → 단일 서비스로 어디에나 올릴 수 있다.
 * 개발 중에는 dist/가 없거나 오래됐을 수 있으므로 vite dev 서버(5173)를 그대로 쓴다.
 */
const DIST = join(dirname(fileURLToPath(import.meta.url)), "../dist");
if (existsSync(join(DIST, "index.html"))) {
  app.use(express.static(DIST));
  // SPA 폴백 — /api/* 는 위에서 처리되므로 제외. Express 5의 path-to-regexp 이슈를 피해 미들웨어로 처리.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(join(DIST, "index.html"));
  });
}

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  const mode = MOCK_MODE ? "MOCK 모드 — OPENAI_API_KEY 미설정" : "LIVE 모드";
  const web = existsSync(join(DIST, "index.html")) ? " · dist/ 서빙" : "";
  console.log(`[소보루] http://localhost:${PORT} (${mode}${web})`);
});
