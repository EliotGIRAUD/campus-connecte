import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import { config } from "./config";
import { logEvent } from "./logger";

export type LakeEvent = {
  topic: string;
  deviceId?: string | null;
  messageKind?: string | null;
  messageId?: string | null;
  payloadRaw: string;
  payload?: unknown;
  receivedAt: Date;
};

export type ConsolidationStatus = "pending" | "processing" | "processed" | "rejected" | "error";

export type ConsolidationJob = {
  lakeEventId: ObjectId;
  topic: string;
  deviceId?: string | null;
  messageKind?: string | null;
  messageId?: string | null;
  payloadRaw: string;
  status: ConsolidationStatus;
  attempts: number;
  /** Earliest time the job may be claimed (backoff after errors). */
  availableAt: Date;
  lockedBy?: string | null;
  lockedAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null;
};

let client: MongoClient | null = null;
let db: Db | null = null;
let events: Collection<LakeEvent> | null = null;
let jobs: Collection<ConsolidationJob> | null = null;

export async function connectLake(): Promise<void> {
  if (client) {
    return;
  }
  client = new MongoClient(config.lakeMongoUrl);
  await client.connect();
  db = client.db(config.lakeMongoDb);
  events = db.collection<LakeEvent>("mqtt_events");
  jobs = db.collection<ConsolidationJob>("consolidation_jobs");

  await events.createIndex({ receivedAt: -1 });
  await events.createIndex({ deviceId: 1, receivedAt: -1 });
  await events.createIndex({ messageId: 1 }, { sparse: true });
  try {
    await events.dropIndex("mqtt_events_ttl");
  } catch {
    // First boot: the TTL index does not exist yet.
  }
  await events.createIndex(
    { receivedAt: 1 },
    { name: "mqtt_events_ttl", expireAfterSeconds: config.lakeTtlSeconds },
  );

  await jobs.createIndex({ status: 1, createdAt: 1 });
  await jobs.createIndex({ status: 1, availableAt: 1 });
  await jobs.createIndex({ status: 1, lockedAt: 1 });
  await jobs.createIndex({ lakeEventId: 1 }, { unique: true });
  await jobs.createIndex({ messageId: 1 }, { sparse: true });

  logEvent(
    "info",
    {
      eventType: "lake.connected",
      status: "ok",
      db: config.lakeMongoDb,
      ttlSeconds: config.lakeTtlSeconds,
      queue: "consolidation_jobs",
    },
    "data lake mongodb connecte",
  );
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

export function consolidationJobs(): Collection<ConsolidationJob> {
  if (!jobs) {
    throw new Error("file consolidation mongodb non initialisee");
  }
  return jobs;
}

export async function disconnectLake(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    events = null;
    jobs = null;
  }
}
