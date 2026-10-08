import { Prisma } from "@prisma/client";
import { evaluateHighCo2Alert } from "../alerts";
import { config } from "../config";
import { prisma } from "../db";
import { logEvent } from "../logger";
import { applyCommandResult } from "../commands";
import {
  availabilitySchema,
  commandResultSchema,
  isObservedAtTooFarInFuture,
  parseTopic,
  stateSchema,
  telemetrySchema,
} from "./contract";
import { recordAverage, purgeOldAverages } from "./averages";

export type ConsolidateOutcome = "processed" | "rejected";

/** Keep at most HISTORY_LIMIT measurements per device (newest by observedAt). */
async function trimHistory(deviceId: string): Promise<void> {
  const excess = await prisma.measurement.findMany({
    where: { deviceId },
    orderBy: { observedAt: "desc" },
    skip: config.historyLimit,
    select: { messageId: true },
  });
  if (excess.length === 0) {
    return;
  }
  const result = await prisma.measurement.deleteMany({
    where: { messageId: { in: excess.map((row) => row.messageId) } },
  });
  logEvent(
    "info",
    {
      eventType: "history.trimmed",
      deviceId,
      deleted: result.count,
      historyLimit: config.historyLimit,
      status: "ok",
    },
    "historique borne",
  );
}

/**
 * Apply business rules to a raw MQTT payload already durable in the lake.
 * Throws on infrastructure errors (Postgres) so the worker can retry.
 */
export async function consolidateRawMessage(
  topic: string,
  payloadRaw: string,
): Promise<ConsolidateOutcome> {
  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) {
    logEvent(
      "warn",
      { eventType: "mqtt.topic_ignored", topic, status: "rejected", reason: "topic_unrecognized" },
      "topic mqtt ignore",
    );
    return "rejected";
  }

  let body: unknown;
  try {
    body = JSON.parse(payloadRaw) as unknown;
  } catch (error) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: parsedTopic.deviceId,
        topic,
        status: "rejected",
        reason: "invalid_json",
        err: error instanceof Error ? error.message : String(error),
      },
      "payload json invalide",
    );
    return "rejected";
  }

  if (parsedTopic.kind === "telemetry") {
    return consolidateTelemetry(parsedTopic.deviceId, body, topic);
  }
  if (parsedTopic.kind === "availability") {
    return consolidateAvailability(parsedTopic.deviceId, body, topic);
  }
  if (parsedTopic.kind === "state") {
    return consolidateState(parsedTopic.deviceId, body, topic);
  }
  if (parsedTopic.kind === "results") {
    return consolidateCommandResult(parsedTopic.deviceId, body, topic);
  }
  return "rejected";
}

async function consolidateTelemetry(
  topicDeviceId: string,
  body: unknown,
  topic: string,
): Promise<ConsolidateOutcome> {
  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    const rangeIssue = parsed.error.issues.some(
      (issue) => issue.code === "too_small" || issue.code === "too_big",
    );
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: rangeIssue ? "out_of_range" : "schema_invalid",
        issues: parsed.error.issues,
      },
      "mesure rejetee",
    );
    return "rejected";
  }

  const message = parsed.data;
  if (message.device_id !== topicDeviceId) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "rejected",
        reason: "device_id_mismatch",
        payloadDeviceId: message.device_id,
      },
      "mesure rejetee: device_id incoherent avec le topic",
    );
    return "rejected";
  }

  const device = await prisma.device.findUnique({ where: { id: topicDeviceId } });
  if (!device) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "rejected",
        reason: "unknown_device",
      },
      "objet inconnu du registre",
    );
    return "rejected";
  }

  const observedAt = new Date(message.observed_at);
  const receivedAt = new Date();

  if (isObservedAtTooFarInFuture(observedAt, receivedAt)) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "rejected",
        reason: "observed_at_in_future",
        observedAt: message.observed_at,
        receivedAt: receivedAt.toISOString(),
      },
      "mesure rejetee: observed_at dans le futur",
    );
    return "rejected";
  }

  // Registry wins for product room assignment; payload room_id is advisory.
  const registryRoomId = device.roomId;
  if (message.room_id !== registryRoomId) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.room_mismatch",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "mismatch",
        payloadRoomId: message.room_id,
        registryRoomId,
      },
      "room_id payload incoherent avec le registre",
    );
  }

  try {
    await prisma.measurement.create({
      data: {
        messageId: message.message_id,
        deviceId: topicDeviceId,
        roomId: registryRoomId,
        observedAt,
        receivedAt,
        temperature: message.temperature.value,
        temperatureUnit: message.temperature.unit,
        co2: message.co2.value,
        co2Unit: message.co2.unit,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logEvent(
        "info",
        {
          eventType: "telemetry.duplicate",
          deviceId: topicDeviceId,
          eventId: message.message_id,
          topic,
          status: "ignored",
          reason: "duplicate_message_id",
        },
        "doublon ignore",
      );
      return "processed";
    }
    throw error;
  }

  await recordAverage({
    deviceId: topicDeviceId,
    roomId: registryRoomId,
    observedAt,
    temperature: message.temperature.value,
    temperatureUnit: message.temperature.unit,
    co2: message.co2.value,
    co2Unit: message.co2.unit,
  });
  await trimHistory(topicDeviceId);
  await purgeOldAverages();

  // Atomic "never regress latest": safe with concurrent consolidation workers.
  const updated = await prisma.device.updateMany({
    where: {
      id: topicDeviceId,
      OR: [{ lastObservedAt: null }, { lastObservedAt: { lte: observedAt } }],
    },
    data: {
      lastMessageId: message.message_id,
      lastObservedAt: observedAt,
      lastReceivedAt: receivedAt,
      temperature: message.temperature.value,
      temperatureUnit: message.temperature.unit,
      co2: message.co2.value,
      co2Unit: message.co2.unit,
    },
  });

  if (updated.count === 0) {
    logEvent(
      "info",
      {
        eventType: "telemetry.stale_kept",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "kept",
        reason: "lost_race_or_older_than_latest",
        observedAt: message.observed_at,
        currentObservedAt: device.lastObservedAt?.toISOString() ?? null,
      },
      "mesure ancienne conservee",
    );
    return "processed";
  }

  // Product alerts follow the latest projection only (not late/stale samples).
  await evaluateHighCo2Alert({
    deviceId: topicDeviceId,
    co2Ppm: message.co2.value,
    messageId: message.message_id,
    observedAt,
  });

  logEvent(
    "info",
    {
      eventType: "telemetry.ingested",
      deviceId: topicDeviceId,
      eventId: message.message_id,
      topic,
      status: "ok",
      observedAt: message.observed_at,
      temperature: message.temperature.value,
      co2: message.co2.value,
    },
    "mesure consolidee",
  );
  return "processed";
}

async function consolidateAvailability(
  topicDeviceId: string,
  body: unknown,
  topic: string,
): Promise<ConsolidateOutcome> {
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    logEvent(
      "warn",
      {
        eventType: "availability.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "schema_invalid",
        issues: parsed.error.issues,
      },
      "disponibilite rejetee",
    );
    return "rejected";
  }
  if (parsed.data.device_id !== topicDeviceId) {
    logEvent(
      "warn",
      {
        eventType: "availability.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "device_id_mismatch",
        payloadDeviceId: parsed.data.device_id,
      },
      "disponibilite incoherente",
    );
    return "rejected";
  }

  const reportedAt = parsed.data.reported_at ? new Date(parsed.data.reported_at) : new Date();
  await prisma.device.update({
    where: { id: topicDeviceId },
    data: {
      availability: parsed.data.status,
      availabilityReason: parsed.data.reason ?? null,
      availabilityAt: reportedAt,
    },
  });
  logEvent(
    "info",
    {
      eventType: "availability.updated",
      deviceId: topicDeviceId,
      topic,
      status: parsed.data.status,
      reason: parsed.data.reason,
    },
    "disponibilite mise a jour",
  );
  return "processed";
}

async function consolidateState(
  topicDeviceId: string,
  body: unknown,
  topic: string,
): Promise<ConsolidateOutcome> {
  const parsed = stateSchema.safeParse(body);
  if (!parsed.success) {
    logEvent(
      "warn",
      {
        eventType: "state.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "schema_invalid",
        issues: parsed.error.issues,
      },
      "etat rejete",
    );
    return "rejected";
  }
  if (parsed.data.device_id !== topicDeviceId) {
    logEvent(
      "warn",
      {
        eventType: "state.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "device_id_mismatch",
        payloadDeviceId: parsed.data.device_id,
      },
      "etat incoherent",
    );
    return "rejected";
  }

  await prisma.device.update({
    where: { id: topicDeviceId },
    data: { ventilation: parsed.data.ventilation },
  });
  logEvent(
    "info",
    {
      eventType: "state.updated",
      deviceId: topicDeviceId,
      topic,
      status: "ok",
      ventilation: parsed.data.ventilation,
      bootId: parsed.data.boot_id,
    },
    "etat ventilation mis a jour",
  );
  return "processed";
}

async function consolidateCommandResult(
  topicDeviceId: string,
  body: unknown,
  topic: string,
): Promise<ConsolidateOutcome> {
  const parsed = commandResultSchema.safeParse(body);
  if (!parsed.success) {
    logEvent(
      "warn",
      {
        eventType: "command.result_rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "schema_invalid",
        issues: parsed.error.issues,
      },
      "resultat commande rejete",
    );
    return "rejected";
  }
  if (parsed.data.device_id !== topicDeviceId) {
    logEvent(
      "warn",
      {
        eventType: "command.result_rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "device_id_mismatch",
        payloadDeviceId: parsed.data.device_id,
        commandId: parsed.data.command_id,
      },
      "resultat commande incoherent",
    );
    return "rejected";
  }

  await applyCommandResult({
    deviceId: topicDeviceId,
    commandId: parsed.data.command_id,
    resultStatus: parsed.data.status,
    reason: parsed.data.reason,
    ventilation: parsed.data.ventilation,
    topic,
  });
  return "processed";
}
