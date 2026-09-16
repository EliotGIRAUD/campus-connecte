import { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import {
  availabilitySchema,
  parseTopic,
  shouldUpdateLatest,
  stateSchema,
  telemetrySchema,
} from "./contract";
import { recordRawMessage, setLakeOutcome } from "./lake";

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
  logger.info(
    { deviceId, deleted: result.count, historyLimit: config.historyLimit },
    "historique borne",
  );
}

function parseJson(raw: Buffer): unknown {
  return JSON.parse(raw.toString("utf8"));
}

export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  const lakeEventId = await recordRawMessage(topic, payload);

  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) {
    logger.warn({ topic }, "topic mqtt ignore");
    return;
  }

  let body: unknown;
  try {
    body = parseJson(payload);
  } catch (error) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn({ topic, err: error }, "payload json invalide");
    return;
  }

  if (parsedTopic.kind === "telemetry") {
    await ingestTelemetry(parsedTopic.deviceId, body, lakeEventId);
    return;
  }
  if (parsedTopic.kind === "availability") {
    await ingestAvailability(parsedTopic.deviceId, body, lakeEventId);
    return;
  }
  if (parsedTopic.kind === "state") {
    await ingestState(parsedTopic.deviceId, body, lakeEventId);
  }
}

async function ingestTelemetry(
  topicDeviceId: string,
  body: unknown,
  lakeEventId: string | null,
): Promise<void> {
  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn(
      { deviceId: topicDeviceId, issues: parsed.error.issues, body },
      "mesure rejetee",
    );
    return;
  }

  const message = parsed.data;
  if (message.device_id !== topicDeviceId) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn(
      { topicDeviceId, payloadDeviceId: message.device_id, messageId: message.message_id },
      "mesure rejetee: device_id incoherent avec le topic",
    );
    return;
  }

  const device = await prisma.device.findUnique({ where: { id: topicDeviceId } });
  if (!device) {
    await setLakeOutcome(lakeEventId, "unknown_device");
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
      await setLakeOutcome(lakeEventId, "duplicate");
      logger.info({ messageId: message.message_id, deviceId: topicDeviceId }, "doublon ignore");
      return;
    }
    throw error;
  }

  await trimHistory(topicDeviceId);

  if (!shouldUpdateLatest(device.lastObservedAt, observedAt)) {
    await setLakeOutcome(lakeEventId, "stale");
    logger.info(
      {
        deviceId: topicDeviceId,
        messageId: message.message_id,
        observedAt: message.observed_at,
        currentObservedAt: device.lastObservedAt,
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

  await setLakeOutcome(lakeEventId, "ingested");
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

async function ingestAvailability(
  topicDeviceId: string,
  body: unknown,
  lakeEventId: string | null,
): Promise<void> {
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn({ deviceId: topicDeviceId, issues: parsed.error.issues, body }, "disponibilite rejetee");
    return;
  }
  if (parsed.data.device_id !== topicDeviceId) {
    await setLakeOutcome(lakeEventId, "rejected");
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
  await setLakeOutcome(lakeEventId, "ingested");
  logger.info(
    { deviceId: topicDeviceId, status: parsed.data.status, reason: parsed.data.reason },
    "disponibilite mise a jour",
  );
}

async function ingestState(
  topicDeviceId: string,
  body: unknown,
  lakeEventId: string | null,
): Promise<void> {
  const parsed = stateSchema.safeParse(body);
  if (!parsed.success) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn({ deviceId: topicDeviceId, issues: parsed.error.issues, body }, "etat rejete");
    return;
  }
  if (parsed.data.device_id !== topicDeviceId) {
    await setLakeOutcome(lakeEventId, "rejected");
    logger.warn({ topicDeviceId, payloadDeviceId: parsed.data.device_id }, "etat incoherent");
    return;
  }

  await prisma.device.update({
    where: { id: topicDeviceId },
    data: { ventilation: parsed.data.ventilation },
  });
  await setLakeOutcome(lakeEventId, "ingested");
  logger.info(
    { deviceId: topicDeviceId, ventilation: parsed.data.ventilation, bootId: parsed.data.boot_id },
    "etat ventilation mis a jour",
  );
}
