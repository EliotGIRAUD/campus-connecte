export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://campus:campus@localhost:5432/campus",
  lakeMongoUrl: process.env.LAKE_MONGO_URL ?? "mongodb://localhost:27017",
  lakeMongoDb: process.env.LAKE_MONGO_DB ?? "campus_lake",
  mqtt: {
    url: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    username: process.env.MQTT_USER ?? "backend",
    password: process.env.MQTT_PASSWORD ?? "backend-demo",
  },
  freshnessMs: Number(process.env.FRESHNESS_MS ?? 10_000),
  commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS ?? 15_000),
  alertCo2Ppm: Number(process.env.ALERT_CO2_PPM ?? 1500),
  historyLimit: Number(process.env.HISTORY_LIMIT ?? 200),
};

export const CATALOG = [
  { id: "sensor-001", roomId: "salle-203", label: "Salle 203" },
  { id: "sensor-002", roomId: "salle-204", label: "Salle 204" },
  { id: "sensor-003", roomId: "salle-205", label: "Salle 205" },
] as const;
