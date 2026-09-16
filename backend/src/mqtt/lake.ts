import { lakePrisma } from "../lake-db";
import { logger } from "../logger";
import { parseTopic } from "./contract";

export type LakeOutcome =
  | "received"
  | "ingested"
  | "rejected"
  | "duplicate"
  | "stale"
  | "unknown_device"
  | "ignored_topic";

function parsePayload(raw: Buffer): unknown | null {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Append every MQTT message to the data lake before business rules run. */
export async function recordRawMessage(topic: string, payload: Buffer): Promise<string | null> {
  const parsedTopic = parseTopic(topic);
  const payloadRaw = payload.toString("utf8");
  const payloadJson = parsePayload(payload);

  try {
    const event = await lakePrisma.rawMqttEvent.create({
      data: {
        topic,
        deviceId: parsedTopic?.deviceId ?? null,
        messageKind: parsedTopic?.kind ?? null,
        payloadRaw,
        payloadJson: payloadJson === null ? undefined : (payloadJson as object),
        outcome: parsedTopic ? "received" : "ignored_topic",
      },
    });
    return event.id;
  } catch (error) {
    logger.warn({ topic, err: error }, "echec ecriture data lake");
    return null;
  }
}

export async function setLakeOutcome(eventId: string | null, outcome: LakeOutcome): Promise<void> {
  if (!eventId) {
    return;
  }
  try {
    await lakePrisma.rawMqttEvent.update({
      where: { id: eventId },
      data: { outcome },
    });
  } catch (error) {
    logger.warn({ eventId, outcome, err: error }, "echec mise a jour outcome lake");
  }
}
