import { logEvent } from "../logger";
import { parseTopic } from "./contract";
import { recordRawMessage } from "./lake";
import { enqueueConsolidation } from "./queue";

/**
 * Ingestion only: durable lake write + enqueue for consolidation.
 * Does not touch PostgreSQL — that is the consolidator's job.
 */
export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  const parsedTopic = parseTopic(topic);
  const payloadRaw = payload.toString("utf8");

  let lakeEventId;
  try {
    lakeEventId = await recordRawMessage(topic, payload);
  } catch (error) {
    logEvent(
      "error",
      {
        eventType: "lake.write_failed",
        topic,
        deviceId: parsedTopic?.deviceId ?? undefined,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      },
      "echec ecriture data lake — ingestion refusee",
    );
    throw error;
  }

  try {
    await enqueueConsolidation({
      lakeEventId,
      topic,
      deviceId: parsedTopic?.deviceId ?? null,
      messageKind: parsedTopic?.kind ?? null,
      messageId: extractMessageId(payloadRaw),
      payloadRaw,
    });
  } catch (error) {
    logEvent(
      "error",
      {
        eventType: "consolidation.enqueue_failed",
        topic,
        deviceId: parsedTopic?.deviceId ?? undefined,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
        lakeEventId: String(lakeEventId),
      },
      "echec enqueue consolidation — event lake sans job",
    );
    throw error;
  }

  logEvent(
    "debug",
    {
      eventType: "mqtt.queued",
      topic,
      deviceId: parsedTopic?.deviceId ?? undefined,
      eventId: extractMessageId(payloadRaw) ?? undefined,
      status: "pending",
      lakeEventId: String(lakeEventId),
    },
    "message ingere (lake + file)",
  );
}

function extractMessageId(payloadRaw: string): string | null {
  try {
    const parsed = JSON.parse(payloadRaw) as { message_id?: unknown };
    return typeof parsed.message_id === "string" ? parsed.message_id : null;
  } catch {
    return null;
  }
}
