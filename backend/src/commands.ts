import { randomUUID } from "node:crypto";
import { config } from "./config";
import { prisma } from "./db";
import { logEvent } from "./logger";
import { publishDeviceCommand } from "./mqtt/client";

export const COMMAND_STATUSES = [
  "PENDING",
  "SENT",
  "ACKNOWLEDGED",
  "FAILED",
  "TIMEOUT",
] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export type CommandRow = {
  id: string;
  deviceId: string;
  action: string;
  enabled: boolean;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  resultStatus: string | null;
  resultReason: string | null;
  resultVentilation: boolean | null;
  timedOutAt: Date | null;
  lateAckAt: Date | null;
};

export function serializeCommand(command: CommandRow) {
  return {
    command_id: command.id,
    device_id: command.deviceId,
    action: command.action,
    enabled: command.enabled,
    status: command.status,
    created_at: command.createdAt.toISOString(),
    expires_at: command.expiresAt.toISOString(),
    sent_at: command.sentAt?.toISOString() ?? null,
    acknowledged_at: command.acknowledgedAt?.toISOString() ?? null,
    timed_out_at: command.timedOutAt?.toISOString() ?? null,
    late_ack_at: command.lateAckAt?.toISOString() ?? null,
    result: command.resultStatus
      ? {
          status: command.resultStatus,
          reason: command.resultReason,
          ventilation: command.resultVentilation,
        }
      : null,
  };
}

/** Create, persist, publish a set_ventilation command. */
export async function issueVentilationCommand(
  deviceId: string,
  enabled: boolean,
  commandId?: string,
): Promise<{ command: CommandRow; created: boolean }> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) {
    throw Object.assign(new Error("objet inconnu"), { statusCode: 404 });
  }

  const id = commandId?.trim() || randomUUID().replace(/-/g, "").slice(0, 24);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw Object.assign(new Error("command_id invalide"), { statusCode: 400 });
  }

  const existing = await prisma.command.findUnique({ where: { id } });
  if (existing) {
    if (existing.deviceId !== deviceId || existing.action !== "set_ventilation" || existing.enabled !== enabled) {
      throw Object.assign(new Error("command_id deja utilise avec un autre contenu"), {
        statusCode: 409,
      });
    }
    logEvent(
      "info",
      {
        eventType: "command.duplicate_request",
        deviceId,
        commandId: id,
        status: existing.status,
      },
      "requete commande idempotente — commande existante renvoyee",
    );
    return { command: existing, created: false };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.commandTimeoutMs);

  const created = await prisma.command.create({
    data: {
      id,
      deviceId,
      action: "set_ventilation",
      enabled,
      status: "PENDING",
      createdAt: now,
      expiresAt,
    },
  });

  logEvent(
    "info",
    {
      eventType: "command.accepted",
      deviceId,
      commandId: id,
      status: "PENDING",
      enabled,
      expiresAt: expiresAt.toISOString(),
    },
    "commande acceptee par l'API",
  );

  const topic = `campus/v1/devices/${deviceId}/commands`;
  const payload = {
    schema_version: 1 as const,
    command_id: id,
    action: "set_ventilation" as const,
    enabled,
    expires_at: expiresAt.toISOString(),
  };

  try {
    await publishDeviceCommand(deviceId, payload);
  } catch (error) {
    await prisma.command.update({
      where: { id },
      data: { status: "FAILED", resultReason: "mqtt_publish_failed" },
    });
    logEvent(
      "error",
      {
        eventType: "command.publish_failed",
        deviceId,
        commandId: id,
        topic,
        status: "FAILED",
        reason: error instanceof Error ? error.message : String(error),
      },
      "publication mqtt commande echouee",
    );
    throw Object.assign(new Error("publication mqtt impossible"), { statusCode: 503 });
  }

  const sent = await prisma.command.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });

  logEvent(
    "info",
    {
      eventType: "command.sent",
      deviceId,
      commandId: id,
      topic,
      status: "SENT",
      enabled,
    },
    "commande publiee sur mqtt",
  );

  return { command: sent, created: true };
}

/** Apply a device result (ACK / reject) to the matching command. */
export async function applyCommandResult(input: {
  deviceId: string;
  commandId: string;
  resultStatus: "executed" | "rejected";
  reason?: string;
  ventilation?: boolean;
  topic: string;
}): Promise<void> {
  const command = await prisma.command.findUnique({ where: { id: input.commandId } });
  if (!command) {
    logEvent(
      "warn",
      {
        eventType: "command.ack_orphan",
        deviceId: input.deviceId,
        commandId: input.commandId,
        topic: input.topic,
        status: "rejected",
        reason: "unknown_command_id",
      },
      "ACK pour une commande inconnue",
    );
    return;
  }

  if (command.deviceId !== input.deviceId) {
    logEvent(
      "warn",
      {
        eventType: "command.ack_rejected",
        deviceId: input.deviceId,
        commandId: input.commandId,
        topic: input.topic,
        status: "rejected",
        reason: "device_mismatch",
        expectedDeviceId: command.deviceId,
      },
      "ACK device incoherent avec la commande",
    );
    return;
  }

  if (command.status === "ACKNOWLEDGED" || command.status === "FAILED") {
    logEvent(
      "info",
      {
        eventType: "command.ack_duplicate",
        deviceId: input.deviceId,
        commandId: input.commandId,
        topic: input.topic,
        status: command.status,
        reason: "already_terminal",
      },
      "ACK ignore — commande deja terminee",
    );
    return;
  }

  const now = new Date();
  const isLate = command.status === "TIMEOUT";
  const nextStatus: CommandStatus =
    input.resultStatus === "executed" ? "ACKNOWLEDGED" : "FAILED";

  if (isLate) {
    await prisma.command.update({
      where: { id: command.id },
      data: {
        lateAckAt: now,
        acknowledgedAt: now,
        resultStatus: input.resultStatus,
        resultReason: input.reason ?? null,
        resultVentilation: input.ventilation ?? null,
        // Keep TIMEOUT: UI already showed expiry; late proof stays in late_ack_at + logs.
      },
    });
    logEvent(
      "warn",
      {
        eventType: "command.ack_late",
        deviceId: input.deviceId,
        commandId: input.commandId,
        topic: input.topic,
        status: "TIMEOUT",
        resultStatus: input.resultStatus,
        reason: "ack_after_timeout",
        ventilation: input.ventilation,
      },
      "ACK arrive apres timeout — statut TIMEOUT conserve",
    );
    return;
  }

  await prisma.command.update({
    where: { id: command.id },
    data: {
      status: nextStatus,
      acknowledgedAt: now,
      resultStatus: input.resultStatus,
      resultReason: input.reason ?? null,
      resultVentilation: input.ventilation ?? null,
    },
  });

  logEvent(
    "info",
    {
      eventType: nextStatus === "ACKNOWLEDGED" ? "command.acknowledged" : "command.failed",
      deviceId: input.deviceId,
      commandId: input.commandId,
      topic: input.topic,
      status: nextStatus,
      resultStatus: input.resultStatus,
      reason: input.reason,
      ventilation: input.ventilation,
    },
    nextStatus === "ACKNOWLEDGED" ? "commande confirmee par l'objet" : "commande rejetee par l'objet",
  );
}

/** Mark SENT/PENDING commands past expiresAt as TIMEOUT. */
export async function sweepCommandTimeouts(): Promise<number> {
  const now = new Date();
  const expired = await prisma.command.findMany({
    where: {
      status: { in: ["PENDING", "SENT"] },
      expiresAt: { lte: now },
    },
    take: 100,
  });

  for (const command of expired) {
    await prisma.command.update({
      where: { id: command.id },
      data: { status: "TIMEOUT", timedOutAt: now },
    });
    logEvent(
      "warn",
      {
        eventType: "command.timeout",
        deviceId: command.deviceId,
        commandId: command.id,
        status: "TIMEOUT",
        reason: "no_ack_before_expires_at",
        expiresAt: command.expiresAt.toISOString(),
      },
      "timeout commande — aucun ACK avant expires_at",
    );
  }

  return expired.length;
}

export function startCommandTimeoutSweeper(): void {
  const tick = () => {
    void sweepCommandTimeouts().catch((error) => {
      logEvent(
        "error",
        {
          eventType: "command.timeout_sweep_failed",
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        },
        "echec balayage timeouts commandes",
      );
    });
  };
  tick();
  setInterval(tick, 1_000);
}
