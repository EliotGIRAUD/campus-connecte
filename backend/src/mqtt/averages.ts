import { config } from "../config";
import { prisma } from "../db";
import { windowStartOf } from "./window";

export async function recordAverage(input: {
  deviceId: string;
  roomId: string;
  observedAt: Date;
  temperature: number;
  temperatureUnit: string;
  co2: number;
  co2Unit: string;
}): Promise<void> {
  const windowStart = windowStartOf(input.observedAt, config.averageWindowMs);
  await prisma.measurementAverage.upsert({
    where: {
      deviceId_windowStart: { deviceId: input.deviceId, windowStart },
    },
    create: {
      deviceId: input.deviceId,
      windowStart,
      roomId: input.roomId,
      sampleCount: 1,
      temperatureSum: input.temperature,
      co2Sum: input.co2,
      temperatureUnit: input.temperatureUnit,
      co2Unit: input.co2Unit,
    },
    update: {
      sampleCount: { increment: 1 },
      temperatureSum: { increment: input.temperature },
      co2Sum: { increment: input.co2 },
      roomId: input.roomId,
      temperatureUnit: input.temperatureUnit,
      co2Unit: input.co2Unit,
    },
  });
}

export async function purgeOldAverages(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - config.averageRetentionMs);
  const result = await prisma.measurementAverage.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return result.count;
}
