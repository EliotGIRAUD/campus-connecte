-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ventilation" BOOLEAN,
    "availability" TEXT NOT NULL DEFAULT 'unknown',
    "availabilityAt" TIMESTAMP(3),
    "availabilityReason" TEXT,
    "lastMessageId" TEXT,
    "lastObservedAt" TIMESTAMP(3),
    "lastReceivedAt" TIMESTAMP(3),
    "temperature" DOUBLE PRECISION,
    "temperatureUnit" TEXT,
    "co2" DOUBLE PRECISION,
    "co2Unit" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "messageId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "temperatureUnit" TEXT NOT NULL,
    "co2" DOUBLE PRECISION NOT NULL,
    "co2Unit" TEXT NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE INDEX "Measurement_deviceId_observedAt_idx" ON "Measurement"("deviceId", "observedAt" DESC);

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
