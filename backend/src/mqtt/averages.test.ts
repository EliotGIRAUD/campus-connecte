import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { windowStartOf } from "./window";

describe("moyennes 10 min", () => {
  const windowMs = 10 * 60 * 1000;

  it("aligne une mesure sur le debut de fenetre de 10 minutes", () => {
    const at = new Date("2026-09-16T12:07:33.000Z");
    assert.equal(windowStartOf(at, windowMs).toISOString(), "2026-09-16T12:00:00.000Z");
  });

  it("garde une mesure deja alignee", () => {
    const at = new Date("2026-09-16T12:10:00.000Z");
    assert.equal(windowStartOf(at, windowMs).toISOString(), "2026-09-16T12:10:00.000Z");
  });
});
