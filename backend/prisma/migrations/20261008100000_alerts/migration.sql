-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "thresholdPpm" DOUBLE PRECISION NOT NULL,
    "hysteresisPpm" DOUBLE PRECISION NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedCo2" DOUBLE PRECISION NOT NULL,
    "openedMessageId" TEXT,
    "peakCo2" DOUBLE PRECISION NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedCo2" DOUBLE PRECISION,
    "resolvedMessageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_deviceId_status_openedAt_idx" ON "Alert"("deviceId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_status_openedAt_idx" ON "Alert"("status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_type_status_idx" ON "Alert"("type", "status");

-- At most one OPEN alert per device + type (hysteresis product rule).
CREATE UNIQUE INDEX "Alert_deviceId_type_open_uidx" ON "Alert"("deviceId", "type") WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
