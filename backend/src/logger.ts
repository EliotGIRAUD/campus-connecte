import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: process.env.SERVICE_NAME ?? "backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Docker Compose / Loki expect JSON on stdout (no pino-pretty).
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export type LogEventFields = {
  eventType: string;
  deviceId?: string;
  eventId?: string;
  topic?: string;
  status?: string;
  reason?: string;
  [key: string]: unknown;
};

/** Structured application event for Loki / LogQL filters. */
export function logEvent(
  level: "info" | "warn" | "error",
  fields: LogEventFields,
  message?: string,
): void {
  const { eventType, ...rest } = fields;
  const msg = message ?? eventType;
  logger[level]({ eventType, ...rest }, msg);
}
