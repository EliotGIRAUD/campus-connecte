import { logEvent } from "../logger";
import { config } from "../config";
import { consolidateRawMessage } from "./consolidate";
import {
  claimNextJob,
  getConsolidationLag,
  markJobError,
  markJobProcessed,
  markJobRejected,
} from "./queue";

let running = false;
const timers: NodeJS.Timeout[] = [];

async function workerLoop(workerId: string): Promise<void> {
  while (running) {
    try {
      const job = await claimNextJob(workerId);
      if (!job) {
        await sleep(config.consolidationPollMs);
        continue;
      }

      try {
        const outcome = await consolidateRawMessage(job.topic, job.payloadRaw);
        if (outcome === "rejected") {
          await markJobRejected(job._id, "business_rejected");
          logEvent(
            "info",
            {
              eventType: "consolidation.rejected",
              deviceId: job.deviceId ?? undefined,
              eventId: job.messageId ?? undefined,
              topic: job.topic,
              status: "rejected",
              workerId,
              attempts: job.attempts,
            },
            "consolidation rejetee",
          );
        } else {
          await markJobProcessed(job._id);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await markJobError(job._id, reason, job.attempts);
        logEvent(
          "error",
          {
            eventType: "consolidation.failed",
            deviceId: job.deviceId ?? undefined,
            eventId: job.messageId ?? undefined,
            topic: job.topic,
            status: "error",
            reason,
            workerId,
            attempts: job.attempts,
          },
          "consolidation echouee",
        );
      }
    } catch (error) {
      logEvent(
        "error",
        {
          eventType: "consolidation.worker_error",
          status: "error",
          workerId,
          reason: error instanceof Error ? error.message : String(error),
        },
        "erreur boucle worker consolidation",
      );
      await sleep(config.consolidationPollMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timers.push(timer);
  });
}

export function startConsolidationWorkers(): void {
  if (running) {
    return;
  }
  running = true;
  const n = Math.max(1, config.consolidationWorkers);
  for (let i = 0; i < n; i += 1) {
    const workerId = `consolidator-${process.pid}-${i + 1}`;
    void workerLoop(workerId);
  }
  logEvent(
    "info",
    {
      eventType: "consolidation.workers_started",
      status: "ok",
      workers: n,
      pollMs: config.consolidationPollMs,
      lockMs: config.consolidationLockMs,
    },
    "workers consolidation demarres",
  );

  // Periodic lag signal for observability (not a second consumer).
  const lagTimer = setInterval(() => {
    void getConsolidationLag()
      .then((lag) => {
        if (lag.pending + lag.processing + lag.error === 0) {
          return;
        }
        logEvent(
          "info",
          {
            eventType: "consolidation.lag",
            status: lag.lagMs != null && lag.lagMs > config.consolidationLagWarnMs ? "degraded" : "ok",
            pending: lag.pending,
            processing: lag.processing,
            error: lag.error,
            lagMs: lag.lagMs,
            oldestPendingAt: lag.oldestPendingAt,
            workers: lag.workers,
          },
          "lag consolidation",
        );
      })
      .catch(() => {
        /* ignore lag probe errors */
      });
  }, Math.max(5_000, config.consolidationPollMs * 10));
  timers.push(lagTimer);
}

export function stopConsolidationWorkers(): void {
  running = false;
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.length = 0;
}
