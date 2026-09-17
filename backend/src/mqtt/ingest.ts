import { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { logEvent } from "../logger";
import {
  availabilitySchema,
  parseTopic,
  shouldUpdateLatest,
  stateSchema,
  telemetrySchema,
} from "./contract";
import { recordAverage, purgeOldAverages } from "./averages";
import { recordRawMessage } from "./lake";

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

function parseJson(raw: Buffer): unknown {
  return JSON.parse(raw.toString("utf8"));
}

export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  // Append-only lake write (MongoDB) — never blocks business rules on update/lock.
  await recordRawMessage(topic, payload);

  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) {
    logEvent(
      "warn",
      { eventType: "mqtt.topic_ignored", topic, status: "rejected", reason: "topic_unrecognized" },
      "topic mqtt ignore",
    );
    return;
  }

  let body: unknown;
  try {
    body = parseJson(payload);
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
    return;
  }

  if (parsedTopic.kind === "telemetry") {
    await ingestTelemetry(parsedTopic.deviceId, body, topic);
    return;
  }
  if (parsedTopic.kind === "availability") {
    await ingestAvailability(parsedTopic.deviceId, body, topic);
    return;
  }
  if (parsedTopic.kind === "state") {
    await ingestState(parsedTopic.deviceId, body, topic);
  }
}

async function ingestTelemetry(topicDeviceId: string, body: unknown, topic: string): Promise<void> {
  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    logEvent(
      "warn",
      {
        eventType: "telemetry.rejected",
        deviceId: topicDeviceId,
        topic,
        status: "rejected",
        reason: "schema_invalid",
        issues: parsed.error.issues,
      },
      "mesure rejetee",
    );
    return;
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
    return;
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
    return;
  }

  const observedAt = new Date(message.observed_at);
  const receivedAt = new Date();

  try {
    await prisma.measurement.create({
      data: {
        messageId: message.message_id,
        deviceId: topicDeviceId,
        roomId: message.room_id,
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
      return;
    }
    throw error;
  }

  await recordAverage({
    deviceId: topicDeviceId,
    roomId: message.room_id,
    observedAt,
    temperature: message.temperature.value,
    temperatureUnit: message.temperature.unit,
    co2: message.co2.value,
    co2Unit: message.co2.unit,
  });
  await trimHistory(topicDeviceId);
  await purgeOldAverages();

  if (!shouldUpdateLatest(device.lastObservedAt, observedAt)) {
    logEvent(
      "info",
      {
        eventType: "telemetry.stale_kept",
        deviceId: topicDeviceId,
        eventId: message.message_id,
        topic,
        status: "kept",
        reason: "older_than_latest",
        observedAt: message.observed_at,
        currentObservedAt: device.lastObservedAt?.toISOString() ?? null,
      },
      "mesure ancienne conservee",
    );
    return;
  }

  await prisma.device.update({
    where: { id: topicDeviceId },
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
    "mesure ingeree",
  );
}

async function ingestAvailability(
  topicDeviceId: string,
  body: unknown,
  topic: string,
): Promise<void> {
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
    return;
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
    return;
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
}

async function ingestState(topicDeviceId: string, body: unknown, topic: string): Promise<void> {
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
    return;
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
    return;
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
}
