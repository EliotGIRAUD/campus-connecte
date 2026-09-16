-- CreateTable
CREATE TABLE "RawMqttEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "deviceId" TEXT,
    "messageKind" TEXT,
    "payloadRaw" TEXT NOT NULL,
    "payloadJson" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL DEFAULT 'received',

    CONSTRAINT "RawMqttEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawMqttEvent_receivedAt_idx" ON "RawMqttEvent"("receivedAt" DESC);

-- CreateIndex
CREATE INDEX "RawMqttEvent_deviceId_receivedAt_idx" ON "RawMqttEvent"("deviceId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "RawMqttEvent_outcome_idx" ON "RawMqttEvent"("outcome");
