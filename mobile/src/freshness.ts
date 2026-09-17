export const FRESHNESS_MS = 10_000;

export type Freshness = "fresh" | "stale" | "unknown";

export function freshnessOf(
  observedAt: Date | string | null | undefined,
  now: Date = new Date(),
  freshnessMs: number = FRESHNESS_MS,
): Freshness {
  if (observedAt == null) {
    return "unknown";
  }
  const at = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
  if (Number.isNaN(at.getTime())) {
    return "unknown";
  }
  return now.getTime() - at.getTime() < freshnessMs ? "fresh" : "stale";
}

export function ageMs(observedAt: Date | string, now: Date = new Date()): number {
  const at = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
  return Math.max(0, now.getTime() - at.getTime());
}

/** Recompute freshness / age from observed_at so offline cache does not freeze server snapshots. */
export function withLiveFreshness<T extends { observed_at: string; freshness: Freshness; age_ms: number }>(
  latest: T,
  now: Date = new Date(),
): T {
  return {
    ...latest,
    age_ms: ageMs(latest.observed_at, now),
    freshness: freshnessOf(latest.observed_at, now),
  };
}
