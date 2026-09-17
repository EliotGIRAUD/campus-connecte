import { z } from "zod";

const finiteNumber = z.number().finite();

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "datetime ISO 8601 attendu",
});

const quantity = z.object({
  value: finiteNumber,
  unit: z.string().min(1),
});

/** Campus-plausible bounds (métier). Kit normal ~420–2500 ppm ; high-co2 reste ≤ 5000. */
export const TEMPERATURE_MIN_C = -40;
export const TEMPERATURE_MAX_C = 80;
export const CO2_MIN_PPM = 0;
export const CO2_MAX_PPM = 5000;
/** Allow small clock skew between publisher and backend. */
export const OBSERVED_AT_FUTURE_SKEW_MS = 60_000;

export const telemetrySchema = z.object({
  schema_version: z.literal(1),
  message_id: z.string().min(1),
  device_id: z.string().min(1),
  room_id: z.string().min(1),
  observed_at: isoDate,
  temperature: quantity.extend({
    unit: z.literal("°C"),
    value: finiteNumber.min(TEMPERATURE_MIN_C).max(TEMPERATURE_MAX_C),
  }),
  co2: quantity.extend({
    unit: z.literal("ppm"),
    value: finiteNumber.min(CO2_MIN_PPM).max(CO2_MAX_PPM),
  }),
});

export const availabilitySchema = z.object({
  schema_version: z.literal(1),
  device_id: z.string().min(1),
  status: z.enum(["online", "offline"]),
  reported_at: isoDate.optional(),
  reason: z.string().optional(),
});

export const stateSchema = z.object({
  schema_version: z.literal(1),
  device_id: z.string().min(1),
  reported_at: isoDate,
  boot_id: z.string().min(1),
  ventilation: z.boolean(),
});

export type Telemetry = z.infer<typeof telemetrySchema>;

export function parseTopic(topic: string): { deviceId: string; kind: string } | null {
  const parts = topic.split("/");
  if (parts.length !== 5 || parts[0] !== "campus" || parts[1] !== "v1" || parts[2] !== "devices") {
    return null;
  }
  return { deviceId: parts[3], kind: parts[4] };
}

export function shouldUpdateLatest(currentObservedAt: Date | null, incoming: Date): boolean {
  if (!currentObservedAt) {
    return true;
  }
  return incoming >= currentObservedAt;
}

/** Reject observations too far in the future (clock skew aside). */
export function isObservedAtTooFarInFuture(
  observedAt: Date,
  now: Date = new Date(),
  skewMs: number = OBSERVED_AT_FUTURE_SKEW_MS,
): boolean {
  return observedAt.getTime() - now.getTime() > skewMs;
}

export type Freshness = "fresh" | "stale" | "unknown";

export function freshnessOf(observedAt: Date | null, now: Date, freshnessMs: number): Freshness {
  if (!observedAt) {
    return "unknown";
  }
  return now.getTime() - observedAt.getTime() < freshnessMs ? "fresh" : "stale";
}
