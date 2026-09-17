import { CATALOG, config } from "./config";
import { prisma } from "./db";
import { connectLake } from "./lake-db";
import { logEvent } from "./logger";
import { createApp } from "./api/app";
import { connectMqtt } from "./mqtt/client";

async function seedDevices(): Promise<void> {
  for (const item of CATALOG) {
    await prisma.device.upsert({
      where: { id: item.id },
      create: { id: item.id, roomId: item.roomId, label: item.label },
      update: { roomId: item.roomId, label: item.label },
    });
  }
}

async function main(): Promise<void> {
  await connectLake();
  await seedDevices();
  connectMqtt();
  const app = createApp();
  app.listen(config.port, "0.0.0.0", () => {
    logEvent(
      "info",
      { eventType: "api.listening", status: "ok", port: config.port },
      "api en ecoute",
    );
  });
}

void main().catch((error) => {
  logEvent(
    "error",
    {
      eventType: "api.startup_failed",
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
    },
    "demarrage impossible",
  );
  process.exit(1);
});
