import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageMs, freshnessOf, withLiveFreshness } from "./freshness.ts";

describe("freshnessOf", () => {
  const now = new Date("2026-09-17T12:00:10.000Z");

  it("marks recent observations as fresh", () => {
    assert.equal(freshnessOf("2026-09-17T12:00:05.000Z", now), "fresh");
  });

  it("marks old observations as stale", () => {
    assert.equal(freshnessOf("2026-09-17T11:59:50.000Z", now), "stale");
  });

  it("returns unknown for missing timestamps", () => {
    assert.equal(freshnessOf(null, now), "unknown");
    assert.equal(freshnessOf("not-a-date", now), "unknown");
  });
});

describe("withLiveFreshness", () => {
  it("recomputes frozen server snapshots from observed_at", () => {
    const now = new Date("2026-09-17T12:00:20.000Z");
    const live = withLiveFreshness(
      {
        observed_at: "2026-09-17T12:00:00.000Z",
        freshness: "fresh",
        age_ms: 0,
      },
      now,
    );
    assert.equal(live.freshness, "stale");
    assert.equal(live.age_ms, ageMs("2026-09-17T12:00:00.000Z", now));
  });
});
