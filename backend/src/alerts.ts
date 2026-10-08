import { randomUUID } from "node:crypto";
import { config } from "./config";
import { prisma } from "./db";
import { logEvent } from "./logger";

export const ALERT_TYPE_HIGH_CO2 = "high_co2" as const;

export const ALERT_STATUSES = ["OPEN", "RESOLVED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export type AlertRow = {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  thresholdPpm: number;
  hysteresisPpm: number;
  openedAt: Date;
  openedCo2: number;
  openedMessageId: string | null;
  peakCo2: number;
  resolvedAt: Date | null;
  resolvedCo2: number | null;
  resolvedMessageId: string | null;
  updatedAt: Date;
};

export type Co2AlertDecision =
  | { action: "none" }
  | { action: "open" }
  | { action: "keep"; updatePeak: boolean }
  | { action: "resolve" };

/**
 * Pure hysteresis rule (no I/O).
 * Open when CO₂ ≥ openThreshold with no open alert.
 * Stay open while CO₂ > closeThreshold (closeThreshold = open − hysteresis).
 * Resolve when CO₂ ≤ closeThreshold.
 * Never opens a second concurrent alert of the same type.
 */
export function decideCo2Alert(
  hasOpenAlert: boolean,
  co2Ppm: number,
  openThreshold: number,
  closeThreshold: number,
): Co2AlertDecision {
  if (hasOpenAlert) {
    if (co2Ppm <= closeThreshold) {
      return { action: "resolve" };
    }
    return { action: "keep", updatePeak: true };
  }
  if (co2Ppm >= openThreshold) {
    return { action: "open" };
  }
  return { action: "none" };
}

export function alertCloseThresholdPpm(
  openThreshold = config.alertCo2Ppm,
  hysteresis = config.alertHysteresisPpm,
): number {
  return openThreshold - hysteresis;
}

export function serializeAlert(alert: AlertRow) {
  return {
    alert_id: alert.id,
    device_id: alert.deviceId,
    type: alert.type,
    status: alert.status,
    threshold_ppm: alert.thresholdPpm,
    hysteresis_ppm: alert.hysteresisPpm,
    close_threshold_ppm: alert.thresholdPpm - alert.hysteresisPpm,
    opened_at: alert.openedAt.toISOString(),
    opened_co2: alert.openedCo2,
    opened_message_id: alert.openedMessageId,
    peak_co2: alert.peakCo2,
    resolved_at: alert.resolvedAt?.toISOString() ?? null,
    resolved_co2: alert.resolvedCo2,
    resolved_message_id: alert.resolvedMessageId,
  };
}

type EvaluateInput = {
  deviceId: string;
  co2Ppm: number;
  messageId: string;
  observedAt: Date;
};

/**
 * Apply CO₂ alert rule after a measurement becomes the device latest.
 * Idempotent under repeated telemetries while OPEN (no new row).
 */
export async function evaluateHighCo2Alert(input: EvaluateInput): Promise<AlertRow | null> {
  const openThreshold = config.alertCo2Ppm;
  const hysteresis = config.alertHysteresisPpm;
  const closeThreshold = alertCloseThresholdPpm(openThreshold, hysteresis);

  const openAlert = await prisma.alert.findFirst({
    where: { deviceId: input.deviceId, type: ALERT_TYPE_HIGH_CO2, status: "OPEN" },
  });

  const decision = decideCo2Alert(Boolean(openAlert), input.co2Ppm, openThreshold, closeThreshold);

  if (decision.action === "none") {
    return null;
  }

  if (decision.action === "open") {
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const created = await prisma.alert.create({
      data: {
        id,
        deviceId: input.deviceId,
        type: ALERT_TYPE_HIGH_CO2,
        status: "OPEN",
        thresholdPpm: openThreshold,
        hysteresisPpm: hysteresis,
        openedAt: input.observedAt,
        openedCo2: input.co2Ppm,
        openedMessageId: input.messageId,
        peakCo2: input.co2Ppm,
      },
    });
    logEvent(
      "warn",
      {
        eventType: "alert.opened",
        deviceId: input.deviceId,
        eventId: input.messageId,
        alertId: created.id,
        alertType: ALERT_TYPE_HIGH_CO2,
        status: "OPEN",
        co2: input.co2Ppm,
        thresholdPpm: openThreshold,
        closeThresholdPpm: closeThreshold,
      },
      "alerte CO2 ouverte",
    );
    return created;
  }

  if (!openAlert) {
    return null;
  }

  if (decision.action === "keep") {
    if (decision.updatePeak && input.co2Ppm > openAlert.peakCo2) {
      const updated = await prisma.alert.update({
        where: { id: openAlert.id },
        data: { peakCo2: input.co2Ppm },
      });
      logEvent(
        "info",
        {
          eventType: "alert.peak_updated",
          deviceId: input.deviceId,
          eventId: input.messageId,
          alertId: updated.id,
          alertType: ALERT_TYPE_HIGH_CO2,
          status: "OPEN",
          co2: input.co2Ppm,
          peakCo2: updated.peakCo2,
        },
        "pic CO2 alerte mis a jour",
      );
      return updated;
    }
    return openAlert;
  }

  // resolve
  const resolved = await prisma.alert.update({
    where: { id: openAlert.id },
    data: {
      status: "RESOLVED",
      resolvedAt: input.observedAt,
      resolvedCo2: input.co2Ppm,
      resolvedMessageId: input.messageId,
      peakCo2: Math.max(openAlert.peakCo2, input.co2Ppm),
    },
  });
  logEvent(
    "info",
    {
      eventType: "alert.resolved",
      deviceId: input.deviceId,
      eventId: input.messageId,
      alertId: resolved.id,
      alertType: ALERT_TYPE_HIGH_CO2,
      status: "RESOLVED",
      co2: input.co2Ppm,
      thresholdPpm: openThreshold,
      closeThresholdPpm: closeThreshold,
      peakCo2: resolved.peakCo2,
    },
    "alerte CO2 resolue",
  );
  return resolved;
}

export async function findOpenAlert(deviceId: string, type = ALERT_TYPE_HIGH_CO2): Promise<AlertRow | null> {
  return prisma.alert.findFirst({
    where: { deviceId, type, status: "OPEN" },
  });
}
