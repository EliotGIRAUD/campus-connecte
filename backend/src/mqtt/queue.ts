import { type ObjectId, type WithId } from "mongodb";
import { config } from "../config";
import { consolidationJobs, type ConsolidationJob, type ConsolidationStatus } from "../lake-db";

export type { ConsolidationJob, ConsolidationStatus };

export type ConsolidationLag = {
  pending: number;
  processing: number;
  error: number;
  oldestPendingAt: string | null;
  lagMs: number | null;
  workers: number;
};

function backoffMs(attempts: number): number {
  const base = 1_000;
  const capped = Math.min(base * 2 ** Math.max(0, attempts - 1), 60_000);
  return capped;
}

export async function enqueueConsolidation(input: {
  lakeEventId: ObjectId;
  topic: string;
  deviceId?: string | null;
  messageKind?: string | null;
  messageId?: string | null;
  payloadRaw: string;
}): Promise<ObjectId> {
  const now = new Date();
  const result = await consolidationJobs().insertOne({
    lakeEventId: input.lakeEventId,
    topic: input.topic,
    deviceId: input.deviceId ?? null,
    messageKind: input.messageKind ?? null,
    messageId: input.messageId ?? null,
    payloadRaw: input.payloadRaw,
    status: "pending",
    attempts: 0,
    availableAt: now,
    lockedBy: null,
    lockedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    processedAt: null,
  });
  return result.insertedId;
}

/** Atomically claim the next job (pending, stale processing, or retriable error after backoff). */
export async function claimNextJob(workerId: string): Promise<WithId<ConsolidationJob> | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - config.consolidationLockMs);
  const result = await consolidationJobs().findOneAndUpdate(
    {
      $or: [
        { status: "pending", availableAt: { $lte: now } },
        { status: "processing", lockedAt: { $lt: staleBefore } },
        {
          status: "error",
          attempts: { $lt: config.consolidationMaxAttempts },
          availableAt: { $lte: now },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        lockedBy: workerId,
        lockedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
  return result;
}

export async function markJobProcessed(jobId: ObjectId): Promise<void> {
  const now = new Date();
  await consolidationJobs().updateOne(
    { _id: jobId },
    {
      $set: {
        status: "processed",
        lockedBy: null,
        lockedAt: null,
        lastError: null,
        updatedAt: now,
        processedAt: now,
      },
    },
  );
}

export async function markJobRejected(jobId: ObjectId, reason: string): Promise<void> {
  const now = new Date();
  await consolidationJobs().updateOne(
    { _id: jobId },
    {
      $set: {
        status: "rejected",
        lockedBy: null,
        lockedAt: null,
        lastError: reason,
        updatedAt: now,
        processedAt: now,
      },
    },
  );
}

export async function markJobError(jobId: ObjectId, reason: string, attempts: number): Promise<void> {
  const now = new Date();
  const availableAt = new Date(now.getTime() + backoffMs(attempts));
  const exhausted = attempts >= config.consolidationMaxAttempts;
  await consolidationJobs().updateOne(
    { _id: jobId },
    {
      $set: {
        status: "error",
        lockedBy: null,
        lockedAt: null,
        lastError: reason,
        availableAt,
        updatedAt: now,
        ...(exhausted ? { processedAt: now } : {}),
      },
    },
  );
}

export async function getConsolidationLag(): Promise<ConsolidationLag> {
  const collection = consolidationJobs();
  const [pending, processing, error, oldest] = await Promise.all([
    collection.countDocuments({ status: "pending" }),
    collection.countDocuments({ status: "processing" }),
    collection.countDocuments({ status: "error" }),
    collection.find({ status: { $in: ["pending", "processing", "error"] } }).sort({ createdAt: 1 }).limit(1).next(),
  ]);
  const oldestPendingAt = oldest?.createdAt?.toISOString() ?? null;
  const lagMs = oldest?.createdAt ? Date.now() - oldest.createdAt.getTime() : null;
  return {
    pending,
    processing,
    error,
    oldestPendingAt,
    lagMs,
    workers: config.consolidationWorkers,
  };
}
