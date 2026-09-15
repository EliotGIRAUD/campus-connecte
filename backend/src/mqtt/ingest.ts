import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../logger";
import {
  availabilitySchema,
  parseTopic,
  shouldUpdateLatest,
  stateSchema,
  telemetrySchema,
} from "./contract";

function parseJson(raw: Buffer): unknown {
  return JSON.parse(raw.toString("utf8"));
}

export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) {
    logger.warn({ topic }, "topic mqtt ignore");
    return;
  }

  let body: unknown;
  try {
    body = parseJson(payload);
  } catch (error) {
    logger.warn({ topic, err: error }, "payload json invalide");
    return;
  }

  if (parsedTopic.kind === "telemetry") {
    await ingestTelemetry(parsedTopic.deviceId, body);
    return;
  }
  if (parsedTopic.kind === "availability") {
    await ingestAvailability(parsedTopic.deviceId, body);
    return;
  }
  if (parsedTopic.kind === "state") {
    await ingestState(parsedTopic.deviceId, body);
  }
}

async function ingestTelemetry(topicDeviceId: string, body: unknown): Promise<void> {
  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    logger.warn(
      { deviceId: topicDeviceId, issues: parsed.error.issues, body },
      "mesure rejetee",
    );
    return;
  }

  const message = parsed.data;
  if (message.device_id !== topicDeviceId) {
    logger.warn(
      { topicDeviceId, payloadDeviceId: message.device_id, messageId: message.message_id },
      "mesure rejetee: device_id incoherent avec le topic",
    );
    return;
  }

  const device = await prisma.device.findUnique({ where: { id: topicDeviceId } });
  if (!device) {
    logger.warn({ deviceId: topicDeviceId, messageId: message.message_id }, "objet inconnu du registre");
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
      logger.info({ messageId: message.message_id, deviceId: topicDeviceId }, "doublon ignore");
      return;
    }
    throw error;
  }

  if (!shouldUpdateLatest(device.lastObservedAt, observedAt)) {
    logger.info(
      {
        deviceId: topicDeviceId,
        messageId: message.message_id,
        observedAt: message.observed_at,
        currentObservedAt: device.lastObservedAt,
      },
      "mesure ancienne conservee sans remplacer l etat courant",
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

  logger.info(
    {
      deviceId: topicDeviceId,
      messageId: message.message_id,
      observedAt: message.observed_at,
      temperature: message.temperature.value,
      co2: message.co2.value,
    },
    "mesure ingeree",
  );
}

async function ingestAvailability(topicDeviceId: string, body: unknown): Promise<void> {
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ deviceId: topicDeviceId, issues: parsed.error.issues, body }, "disponibilite rejetee");
    return;
  }
  if (parsed.data.device_id !== topicDeviceId) {
    logger.warn({ topicDeviceId, payloadDeviceId: parsed.data.device_id }, "disponibilite incoherente");
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
  logger.info(
    { deviceId: topicDeviceId, status: parsed.data.status, reason: parsed.data.reason },
    "disponibilite mise a jour",
  );
}

async function ingestState(topicDeviceId: string, body: unknown): Promise<void> {
  const parsed = stateSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ deviceId: topicDeviceId, issues: parsed.error.issues, body }, "etat rejete");
    return;
  }
  if (parsed.data.device_id !== topicDeviceId) {
    logger.warn({ topicDeviceId, payloadDeviceId: parsed.data.device_id }, "etat incoherent");
    return;
  }

  await prisma.device.update({
    where: { id: topicDeviceId },
    data: { ventilation: parsed.data.ventilation },
  });
  logger.info(
    { deviceId: topicDeviceId, ventilation: parsed.data.ventilation, bootId: parsed.data.boot_id },
    "etat ventilation mis a jour",
  );
}
