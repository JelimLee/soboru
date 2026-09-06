/**
 * 비용 가드 — 공개 URL이므로 누구나 호출할 수 있고, 호출마다 OpenAI 비용이 발생한다.
 * 심사자가 충분히 체험할 만큼은 허용하되 무제한 소진은 막는다. 외부 의존성(Redis 등) 없이
 * 인메모리로 처리한다 — 인스턴스 재시작 시 초기화되지만 단일 인스턴스 데모 규모에서는 충분하다.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** IP 항목이 이 개수를 넘으면 만료된 것부터 청소한다(메모리 누수 방지). */
const IP_TABLE_SOFT_LIMIT = 5000;

export type QuotaVerdict = { ok: true } | { ok: false; reason: string };

export interface QuotaOptions {
  /** IP당 시간당 허용 요청 수. */
  perIpHourly: number;
  /** 서비스 전체의 하루 허용 요청 수. */
  dailyTotal: number;
  /** 시계 주입 지점 — 테스트에서 시간 경과를 흉내내기 위해 열어 둔다. */
  now?: () => number;
}

export interface QuotaGuard {
  /** 요청 1건을 소비 시도한다. 거부되면 사용자에게 그대로 보여줄 한국어 사유를 담아 반환. */
  check(ip: string): QuotaVerdict;
  /** 오늘 남은 전체 호출 수 (`/api/health`에 노출). */
  dailyRemaining(): number;
}

/**
 * 한도 판정기를 만든다. 판정 규칙:
 * 1. 하루 전체 한도를 먼저 본다 — 초과면 IP 카운터를 건드리지 않고 거부.
 * 2. 이어서 IP별 시간 한도를 본다 — 초과면 거부하며, 이때 **전체 카운터는 올리지 않는다**
 *    (거부된 요청은 비용이 발생하지 않으므로 하루 예산을 깎을 이유가 없다).
 * 3. 둘 다 통과해야 두 카운터가 함께 증가한다.
 */
export function createQuotaGuard({
  perIpHourly,
  dailyTotal,
  now = Date.now,
}: QuotaOptions): QuotaGuard {
  const ipHits = new Map<string, { count: number; resetAt: number }>();
  let daily = { count: 0, resetAt: now() + DAY };

  return {
    check(ip: string): QuotaVerdict {
      const t = now();
      if (t > daily.resetAt) daily = { count: 0, resetAt: t + DAY };
      if (daily.count >= dailyTotal) {
        return {
          ok: false,
          reason: "오늘의 데모 이용 한도에 도달했습니다. 내일 다시 시도해 주세요.",
        };
      }

      const cur = ipHits.get(ip);
      if (!cur || t > cur.resetAt) {
        ipHits.set(ip, { count: 1, resetAt: t + HOUR });
      } else if (cur.count >= perIpHourly) {
        return {
          ok: false,
          reason: `시간당 ${perIpHourly}회까지 이용할 수 있습니다. 잠시 후 다시 시도해 주세요.`,
        };
      } else {
        cur.count += 1;
      }

      daily.count += 1;
      if (ipHits.size > IP_TABLE_SOFT_LIMIT) {
        for (const [k, v] of ipHits) if (t > v.resetAt) ipHits.delete(k);
      }
      return { ok: true };
    },

    dailyRemaining(): number {
      return Math.max(0, dailyTotal - daily.count);
    },
  };
}
