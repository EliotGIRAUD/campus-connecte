import cors from "cors";
import express from "express";
import { config } from "../config";
import { prisma } from "../db";
import { pingLake } from "../lake-db";
import { freshnessOf } from "../mqtt/contract";
import { isMqttConnected } from "../mqtt/client";

function serializeDevice(device: {
  id: string;
  roomId: string;
  label: string;
  ventilation: boolean | null;
  availability: string;
  availabilityAt: Date | null;
  availabilityReason: string | null;
  lastMessageId: string | null;
  lastObservedAt: Date | null;
  lastReceivedAt: Date | null;
  temperature: number | null;
  temperatureUnit: string | null;
  co2: number | null;
  co2Unit: string | null;
}) {
  const now = new Date();
  const latest =
    device.lastMessageId && device.lastObservedAt && device.temperature !== null && device.co2 !== null
      ? {
          message_id: device.lastMessageId,
          observed_at: device.lastObservedAt.toISOString(),
          received_at: device.lastReceivedAt?.toISOString() ?? null,
          age_ms: now.getTime() - device.lastObservedAt.getTime(),
          freshness: freshnessOf(device.lastObservedAt, now, config.freshnessMs),
          temperature: { value: device.temperature, unit: device.temperatureUnit ?? "°C" },
          co2: { value: device.co2, unit: device.co2Unit ?? "ppm" },
        }
      : null;

  return {
    device_id: device.id,
    room_id: device.roomId,
    label: device.label,
    ventilation: device.ventilation,
    availability: {
      status: device.availability,
      reason: device.availabilityReason,
      reported_at: device.availabilityAt?.toISOString() ?? null,
    },
    latest,
  };
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    let dbOk = false;
    let lakeOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    try {
      lakeOk = await pingLake();
    } catch {
      lakeOk = false;
    }
    const ok = dbOk && lakeOk;
    res.status(ok ? 200 : 503).json({
      ok,
      mqtt: isMqttConnected() ? "connected" : "disconnected",
      db: dbOk ? "up" : "down",
      lake_db: lakeOk ? "up" : "down",
      lake_engine: "mongodb",
      freshness_ms: config.freshnessMs,
    });
  });

  app.get("/api/rooms", async (_req, res) => {
    const devices = await prisma.device.findMany({ orderBy: { roomId: "asc" } });
    const byRoom = new Map<string, typeof devices>();
    for (const device of devices) {
      const list = byRoom.get(device.roomId) ?? [];
      list.push(device);
      byRoom.set(device.roomId, list);
    }
    res.json({
      rooms: [...byRoom.entries()].map(([room_id, roomDevices]) => ({
        room_id,
        label: roomDevices[0]?.label ?? room_id,
        devices: roomDevices.map(serializeDevice),
      })),
    });
  });

  app.get("/api/rooms/:roomId", async (req, res) => {
    const devices = await prisma.device.findMany({ where: { roomId: String(req.params.roomId) } });
    if (devices.length === 0) {
      res.status(404).json({ error: "salle inconnue" });
      return;
    }
    res.json({
      room_id: String(req.params.roomId),
      label: devices[0].label,
      devices: devices.map(serializeDevice),
    });
  });

  app.get("/api/devices/:deviceId", async (req, res) => {
    const device = await prisma.device.findUnique({ where: { id: String(req.params.deviceId) } });
    if (!device) {
      res.status(404).json({ error: "objet inconnu" });
      return;
    }
    const limit = Math.min(Number(req.query.limit ?? 20), config.historyLimit);
    const measurements = await prisma.measurement.findMany({
      where: { deviceId: device.id },
      orderBy: { observedAt: "desc" },
      take: limit,
    });
    res.json({
      ...serializeDevice(device),
      measurements: measurements.map((item) => ({
        message_id: item.messageId,
        observed_at: item.observedAt.toISOString(),
        received_at: item.receivedAt.toISOString(),
        temperature: { value: item.temperature, unit: item.temperatureUnit },
        co2: { value: item.co2, unit: item.co2Unit },
      })),
    });
  });

  return app;
}
