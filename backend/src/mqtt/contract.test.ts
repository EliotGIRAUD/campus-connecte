import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  freshnessOf,
  parseTopic,
  shouldUpdateLatest,
  telemetrySchema,
} from "./contract";

describe("contrat mqtt", () => {
  it("extrait l identifiant d objet du topic", () => {
    assert.deepEqual(parseTopic("campus/v1/devices/sensor-001/telemetry"), {
      deviceId: "sensor-001",
      kind: "telemetry",
    });
    assert.equal(parseTopic("autre/topic"), null);
  });

  it("accepte une mesure conforme au contrat", () => {
    const parsed = telemetrySchema.safeParse({
      schema_version: 1,
      message_id: "abc-1",
      device_id: "sensor-001",
      room_id: "salle-203",
      observed_at: "2026-09-15T08:00:00.000Z",
      temperature: { value: 22.1, unit: "°C" },
      co2: { value: 900, unit: "ppm" },
    });
    assert.equal(parsed.success, true);
  });

  it("rejette un CO2 non numerique", () => {
    const parsed = telemetrySchema.safeParse({
      schema_version: 1,
      message_id: "abc-1",
      device_id: "sensor-001",
      room_id: "salle-203",
      observed_at: "2026-09-15T08:00:00.000Z",
      temperature: { value: 22.1, unit: "°C" },
      co2: { value: "invalide", unit: "ppm" },
    });
    assert.equal(parsed.success, false);
  });

  it("ne remplace pas un etat recent par une mesure plus ancienne", () => {
    const current = new Date("2026-09-15T08:00:10.000Z");
    const delayed = new Date("2026-09-15T07:59:10.000Z");
    assert.equal(shouldUpdateLatest(current, delayed), false);
    assert.equal(shouldUpdateLatest(null, delayed), true);
  });

  it("calcule la fraicheur a partir du delai declare", () => {
    const observed = new Date("2026-09-15T08:00:00.000Z");
    const now = new Date("2026-09-15T08:00:09.000Z");
    assert.equal(freshnessOf(observed, now, 10_000), "fresh");
    assert.equal(freshnessOf(observed, new Date("2026-09-15T08:00:11.000Z"), 10_000), "stale");
    assert.equal(freshnessOf(null, now, 10_000), "unknown");
  });
});
