export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://campus:campus@localhost:5432/campus",
  lakeMongoUrl: process.env.LAKE_MONGO_URL ?? "mongodb://localhost:27017",
  lakeMongoDb: process.env.LAKE_MONGO_DB ?? "campus_lake",
  mqtt: {
    url: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    username: process.env.MQTT_USER ?? "backend",
    password: process.env.MQTT_PASSWORD ?? "backend-demo",
    /** Stable across restarts — required for persistent session (clean:false). */
    clientId: process.env.MQTT_CLIENT_ID ?? "campus-backend",
  },
  freshnessMs: Number(process.env.FRESHNESS_MS ?? 10_000),
  /** Command ACK timeout — also used as MQTT expires_at window. */
  commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS ?? 15_000),
  /** Open high-CO₂ alert when latest CO₂ ≥ this (ppm). */
  alertCo2Ppm: Number(process.env.ALERT_CO2_PPM ?? 1500),
  /** Close only when CO₂ ≤ open − hysteresis (default close at 1300 ppm). */
  alertHysteresisPpm: Number(process.env.ALERT_HYSTERESIS_PPM ?? 200),
  historyLimit: Number(process.env.HISTORY_LIMIT ?? 200),
  averageWindowMs: Number(process.env.AVERAGE_WINDOW_MS ?? 10 * 60 * 1000),
  averageRetentionMs: Number(process.env.AVERAGE_RETENTION_MS ?? 30 * 24 * 60 * 60 * 1000),
  lakeTtlSeconds: Number(process.env.LAKE_TTL_SECONDS ?? 7 * 24 * 60 * 60),
  /** In-process consolidation workers (independent from MQTT ingress concurrency). */
  consolidationWorkers: Number(process.env.CONSOLIDATION_WORKERS ?? 2),
  consolidationPollMs: Number(process.env.CONSOLIDATION_POLL_MS ?? 200),
  consolidationLockMs: Number(process.env.CONSOLIDATION_LOCK_MS ?? 30_000),
  consolidationMaxAttempts: Number(process.env.CONSOLIDATION_MAX_ATTEMPTS ?? 8),
  consolidationLagWarnMs: Number(process.env.CONSOLIDATION_LAG_WARN_MS ?? 10_000),
};

export const CATALOG = [
  { id: "sensor-001", roomId: "salle-203", label: "Salle 203" },
  { id: "sensor-002", roomId: "salle-204", label: "Salle 204" },
  { id: "sensor-003", roomId: "salle-205", label: "Salle 205" },
] as const;
