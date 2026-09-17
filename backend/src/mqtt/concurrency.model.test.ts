/**
 * Demonstrates that a naive read-then-write "shouldUpdateLatest" is not atomic:
 * two concurrent handlers can both pass the check against the same snapshot.
 *
 * This is a model of the race — not a full MQTT integration test.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldUpdateLatest } from "./contract.ts";

describe("concurrence latest (modele)", () => {
  it("deux traitements peuvent tous deux croire devoir ecrire le latest", () => {
    const sharedSnapshot = new Date("2026-09-17T12:00:00.000Z");
    const messageA = new Date("2026-09-17T12:00:10.000Z");
    const messageB = new Date("2026-09-17T12:00:05.000Z");

    // Both handlers read the same lastObservedAt before either writes.
    const aWins = shouldUpdateLatest(sharedSnapshot, messageA);
    const bWins = shouldUpdateLatest(sharedSnapshot, messageB);

    assert.equal(aWins, true);
    assert.equal(bWins, true);
    // If B's Device.update runs after A's, latest regresses to 12:00:05.
    assert.equal(messageB < messageA, true);
  });

  it("une comparaison atomique (WHERE) eviterait la regression de B", () => {
    const afterA = new Date("2026-09-17T12:00:10.000Z");
    const messageB = new Date("2026-09-17T12:00:05.000Z");
    // Emulates: UPDATE … WHERE lastObservedAt IS NULL OR lastObservedAt <= $incoming
    const bWouldApply = shouldUpdateLatest(afterA, messageB);
    assert.equal(bWouldApply, false);
  });
});
