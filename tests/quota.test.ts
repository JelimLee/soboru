import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createQuotaGuard } from "../server/lib/quota";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** 테스트가 실제 시간을 기다리지 않도록 시계를 주입한다. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createQuotaGuard — 비용 가드", () => {
  test("IP당 시간 한도까지 허용하고 그 다음부터 거부한다", () => {
    const g = createQuotaGuard({ perIpHourly: 3, dailyTotal: 100, now: clock().now });
    for (let i = 0; i < 3; i++) assert.equal(g.check("1.1.1.1").ok, true, `${i + 1}번째`);
    const denied = g.check("1.1.1.1");
    assert.equal(denied.ok, false);
    assert.ok(!denied.ok && denied.reason.includes("시간당 3회"));
  });

  test("IP 한도는 IP별로 따로 센다", () => {
    const g = createQuotaGuard({ perIpHourly: 1, dailyTotal: 100, now: clock().now });
    assert.equal(g.check("1.1.1.1").ok, true);
    assert.equal(g.check("1.1.1.1").ok, false);
    assert.equal(g.check("2.2.2.2").ok, true);
  });

  test("한 시간이 지나면 IP 카운터가 리셋된다", () => {
    const c = clock();
    const g = createQuotaGuard({ perIpHourly: 1, dailyTotal: 100, now: c.now });
    assert.equal(g.check("1.1.1.1").ok, true);
    assert.equal(g.check("1.1.1.1").ok, false);
    c.advance(HOUR + 1);
    assert.equal(g.check("1.1.1.1").ok, true);
  });

  test("거부된 요청은 하루 예산을 깎지 않는다", () => {
    // 거부된 요청은 OpenAI 호출이 없어 비용이 0이다. 하루 예산에서 빼면
    // 한 명이 연타하는 것만으로 전체 데모가 닫힌다.
    const g = createQuotaGuard({ perIpHourly: 1, dailyTotal: 10, now: clock().now });
    g.check("1.1.1.1"); // 성공 → 9
    for (let i = 0; i < 5; i++) g.check("1.1.1.1"); // 전부 거부
    assert.equal(g.dailyRemaining(), 9);
  });

  test("전체 하루 한도가 IP 한도보다 먼저 판정된다", () => {
    const g = createQuotaGuard({ perIpHourly: 100, dailyTotal: 2, now: clock().now });
    assert.equal(g.check("1.1.1.1").ok, true);
    assert.equal(g.check("2.2.2.2").ok, true);
    const denied = g.check("3.3.3.3");
    assert.equal(denied.ok, false);
    assert.ok(!denied.ok && denied.reason.includes("오늘의 데모 이용 한도"));
    assert.equal(g.dailyRemaining(), 0);
  });

  test("하루가 지나면 전체 카운터가 리셋된다", () => {
    const c = clock();
    const g = createQuotaGuard({ perIpHourly: 100, dailyTotal: 1, now: c.now });
    assert.equal(g.check("1.1.1.1").ok, true);
    assert.equal(g.check("1.1.1.1").ok, false);
    c.advance(DAY + 1);
    assert.equal(g.check("1.1.1.1").ok, true);
    assert.equal(g.dailyRemaining(), 0);
  });

  test("dailyRemaining은 음수로 내려가지 않는다", () => {
    const g = createQuotaGuard({ perIpHourly: 100, dailyTotal: 1, now: clock().now });
    for (let i = 0; i < 5; i++) g.check("1.1.1.1");
    assert.equal(g.dailyRemaining(), 0);
  });

  test("가드 인스턴스끼리 상태를 공유하지 않는다", () => {
    const a = createQuotaGuard({ perIpHourly: 1, dailyTotal: 1, now: clock().now });
    const b = createQuotaGuard({ perIpHourly: 1, dailyTotal: 1, now: clock().now });
    assert.equal(a.check("1.1.1.1").ok, true);
    assert.equal(b.check("1.1.1.1").ok, true);
  });
});
