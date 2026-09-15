import { z } from "zod";

const finiteNumber = z.number().finite();

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "datetime ISO 8601 attendu",
});

const quantity = z.object({
  value: finiteNumber,
  unit: z.string().min(1),
});

export const telemetrySchema = z.object({
  schema_version: z.literal(1),
  message_id: z.string().min(1),
  device_id: z.string().min(1),
  room_id: z.string().min(1),
  observed_at: isoDate,
  temperature: quantity.extend({ unit: z.literal("°C") }),
  co2: quantity.extend({ unit: z.literal("ppm") }),
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

export type Freshness = "fresh" | "stale" | "unknown";

export function freshnessOf(observedAt: Date | null, now: Date, freshnessMs: number): Freshness {
  if (!observedAt) {
    return "unknown";
  }
  return now.getTime() - observedAt.getTime() < freshnessMs ? "fresh" : "stale";
}
