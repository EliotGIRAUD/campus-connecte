import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertCloseThresholdPpm, decideCo2Alert } from "./alerts.ts";

describe("decideCo2Alert hysteresis", () => {
  const open = 1500;
  const close = 1300;

  it("opens when CO₂ crosses the open threshold with no open alert", () => {
    assert.deepEqual(decideCo2Alert(false, 1500, open, close), { action: "open" });
    assert.deepEqual(decideCo2Alert(false, 1800, open, close), { action: "open" });
  });

  it("does nothing below the open threshold when no alert is open", () => {
    assert.deepEqual(decideCo2Alert(false, 1499, open, close), { action: "none" });
    assert.deepEqual(decideCo2Alert(false, 600, open, close), { action: "none" });
  });

  it("keeps a single open alert while CO₂ stays above the close threshold", () => {
    assert.deepEqual(decideCo2Alert(true, 1800, open, close), { action: "keep", updatePeak: true });
    assert.deepEqual(decideCo2Alert(true, 1400, open, close), { action: "keep", updatePeak: true });
    assert.deepEqual(decideCo2Alert(true, 1301, open, close), { action: "keep", updatePeak: true });
  });

  it("resolves only when CO₂ falls to or below the close threshold", () => {
    assert.deepEqual(decideCo2Alert(true, 1300, open, close), { action: "resolve" });
    assert.deepEqual(decideCo2Alert(true, 600, open, close), { action: "resolve" });
  });

  it("does not open a second alert while one is already open", () => {
    const midBand = decideCo2Alert(true, 1600, open, close);
    assert.equal(midBand.action, "keep");
  });
});

describe("alertCloseThresholdPpm", () => {
  it("subtracts hysteresis from the open threshold", () => {
    assert.equal(alertCloseThresholdPpm(1500, 200), 1300);
  });
});
