import { lakeEvents } from "../lake-db";
import { logEvent } from "../logger";
import { parseTopic } from "./contract";

function parsePayload(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function extractMessageId(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "message_id" in payload) {
    const value = (payload as { message_id?: unknown }).message_id;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/**
 * Append-only write to the MongoDB data lake.
 * No updates — one document per MQTT message, timestamped for history.
 */
export async function recordRawMessage(topic: string, payload: Buffer): Promise<void> {
  const parsedTopic = parseTopic(topic);
  const payloadRaw = payload.toString("utf8");
  const parsed = parsePayload(payload);

  try {
    await lakeEvents().insertOne({
      topic,
      deviceId: parsedTopic?.deviceId ?? null,
      messageKind: parsedTopic?.kind ?? null,
      messageId: extractMessageId(parsed),
      payloadRaw,
      payload: parsed,
      receivedAt: new Date(),
    });
  } catch (error) {
    logEvent(
      "warn",
      {
        eventType: "lake.write_failed",
        topic,
        deviceId: parsedTopic?.deviceId ?? undefined,
        eventId: extractMessageId(parsed) ?? undefined,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      },
      "echec ecriture data lake mongodb",
    );
  }
}
