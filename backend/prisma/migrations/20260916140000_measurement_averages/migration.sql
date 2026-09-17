-- CreateTable
CREATE TABLE "MeasurementAverage" (
    "deviceId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "roomId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "temperatureSum" DOUBLE PRECISION NOT NULL,
    "co2Sum" DOUBLE PRECISION NOT NULL,
    "temperatureUnit" TEXT NOT NULL,
    "co2Unit" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementAverage_pkey" PRIMARY KEY ("deviceId","windowStart")
);

-- CreateIndex
CREATE INDEX "MeasurementAverage_deviceId_windowStart_idx" ON "MeasurementAverage"("deviceId", "windowStart" DESC);

-- CreateIndex
CREATE INDEX "MeasurementAverage_windowStart_idx" ON "MeasurementAverage"("windowStart");

-- AddForeignKey
ALTER TABLE "MeasurementAverage" ADD CONSTRAINT "MeasurementAverage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
