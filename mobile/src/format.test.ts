import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { airQuality, formatAge, freshnessLabel, ventilationLabel } from "./format.ts";

describe("formatAge", () => {
  const now = new Date("2026-09-17T12:00:30.000Z");

  it("formats seconds and minutes", () => {
    assert.equal(formatAge("2026-09-17T12:00:20.000Z", now), "il y a 10 s");
    assert.equal(formatAge("2026-09-17T11:58:30.000Z", now), "il y a 2 min");
  });
});

describe("airQuality", () => {
  it("uses display-only CO₂ wording (not product alerts)", () => {
    assert.equal(airQuality(800).label, "Air confortable");
    assert.equal(airQuality(1200).label, "Air chargé");
    assert.deepEqual(airQuality(1600), { label: "CO₂ élevé", tone: "danger" });
  });
});

describe("labels", () => {
  it("maps freshness and ventilation", () => {
    assert.equal(freshnessLabel("stale"), "Donnée ancienne");
    assert.equal(ventilationLabel(true), "Ventilation active");
    assert.equal(ventilationLabel(null), "Ventilation inconnue");
  });
});
