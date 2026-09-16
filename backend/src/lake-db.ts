import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "./config";
import { logger } from "./logger";

export type LakeEvent = {
  topic: string;
  deviceId?: string | null;
  messageKind?: string | null;
  messageId?: string | null;
  payloadRaw: string;
  payload?: unknown;
  receivedAt: Date;
};

let client: MongoClient | null = null;
let db: Db | null = null;
let events: Collection<LakeEvent> | null = null;

export async function connectLake(): Promise<void> {
  if (client) {
    return;
  }
  client = new MongoClient(config.lakeMongoUrl);
  await client.connect();
  db = client.db(config.lakeMongoDb);
  events = db.collection<LakeEvent>("mqtt_events");
  await events.createIndex({ receivedAt: -1 });
  await events.createIndex({ deviceId: 1, receivedAt: -1 });
  await events.createIndex({ messageId: 1 }, { sparse: true });
  logger.info({ db: config.lakeMongoDb }, "data lake mongodb connecte");
}

export async function pingLake(): Promise<boolean> {
  if (!db) {
    await connectLake();
  }
  const result = await db!.command({ ping: 1 });
  return result.ok === 1;
}

export function lakeEvents(): Collection<LakeEvent> {
  if (!events) {
    throw new Error("data lake mongodb non initialise");
  }
  return events;
}

export async function disconnectLake(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    events = null;
  }
}
