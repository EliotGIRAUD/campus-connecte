import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  airQuality,
  alertStatusLabel,
  alertTypeLabel,
  commandStatusLabel,
  formatAge,
  freshnessLabel,
  ventilationLabel,
} from "./format.ts";

describe("formatAge", () => {
  const now = new Date("2026-09-17T12:00:30.000Z");

  it("formats seconds and minutes", () => {
    assert.equal(formatAge("2026-09-17T12:00:20.000Z", now), "il y a 10 s");
    assert.equal(formatAge("2026-09-17T11:58:30.000Z", now), "il y a 2 min");
  });
});

describe("airQuality", () => {
  it("uses display-only CO₂ wording (product alerts come from active_alert)", () => {
    assert.equal(airQuality(800).label, "Air confortable");
    assert.equal(airQuality(1200).label, "Air chargé");
    assert.deepEqual(airQuality(1600), { label: "CO₂ élevé", tone: "danger" });
  });
});

describe("alert labels", () => {
  it("maps product alert type and status", () => {
    assert.equal(alertTypeLabel("high_co2"), "Alerte CO₂");
    assert.equal(alertStatusLabel("OPEN"), "Ouverte");
    assert.equal(alertStatusLabel("RESOLVED"), "Résolue");
  });
});

describe("labels", () => {
  it("maps freshness and ventilation", () => {
    assert.equal(freshnessLabel("stale"), "Donnée ancienne");
    assert.equal(ventilationLabel(true), "Ventilation active");
    assert.equal(ventilationLabel(null), "Ventilation inconnue");
  });

  it("maps command lifecycle statuses", () => {
    assert.equal(commandStatusLabel("SENT"), "En attente de confirmation");
    assert.equal(commandStatusLabel("ACKNOWLEDGED"), "Confirmée par l’objet");
    assert.equal(commandStatusLabel("TIMEOUT"), "Expirée (pas d’acquittement)");
  });
});
