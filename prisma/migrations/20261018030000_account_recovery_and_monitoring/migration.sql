-- Account verification and password reset (EmailToken, session epoch), live
-- monitoring (MonitorEvent, Alert, NetworkSample, SystemState), email outbox
-- (EmailMessage) and shared rate limiting (RateLimitBucket).
-- Generated with `prisma migrate diff`; review before applying to an existing
-- database. The unique index on AlertPreference("userId") fails if that table
-- already holds duplicate rows for one user — reconcile those first.
-- CreateEnum
CREATE TYPE "MonitorEventKind" AS ENUM ('BALANCE_CHANGE', 'OUTGOING_TRANSACTION');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('WATCH_ACTIVITY', 'NETWORK_HEALTH', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'QUEUED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "AlertPreference" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "sessionEpoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WatchAddress" ADD COLUMN     "lastBalanceWei" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastNonce" INTEGER,
ADD COLUMN     "lastObservedBlock" BIGINT;

-- CreateTable
CREATE TABLE "MonitorEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchAddressId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "kind" "MonitorEventKind" NOT NULL,
    "blockNumber" BIGINT,
    "balanceWei" TEXT,
    "previousBalanceWei" TEXT,
    "nonce" INTEGER,
    "detail" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "MonitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchAddressId" TEXT,
    "chainId" INTEGER,
    "kind" "AlertKind" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB,
    "emailStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailError" TEXT,
    "emailedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkSample" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "latestBlock" BIGINT,
    "latencyMs" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "MonitorEvent_userId_detectedAt_idx" ON "MonitorEvent"("userId", "detectedAt");

-- CreateIndex
CREATE INDEX "MonitorEvent_detectedAt_idx" ON "MonitorEvent"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorEvent_watchAddressId_fingerprint_key" ON "MonitorEvent"("watchAddressId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_fingerprint_key" ON "Alert"("fingerprint");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_readAt_idx" ON "Alert"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Alert_emailStatus_createdAt_idx" ON "Alert"("emailStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_status_createdAt_idx" ON "EmailMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkSample_networkId_checkedAt_idx" ON "NetworkSample"("networkId", "checkedAt");

-- CreateIndex
CREATE INDEX "NetworkSample_checkedAt_idx" ON "NetworkSample"("checkedAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_userId_key" ON "AlertPreference"("userId");

-- CreateIndex
CREATE INDEX "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");

-- CreateIndex
CREATE INDEX "WatchAddress_chainId_idx" ON "WatchAddress"("chainId");

-- CreateIndex
CREATE INDEX "WatchAddress_lastCheckedAt_idx" ON "WatchAddress"("lastCheckedAt");

-- AddForeignKey
ALTER TABLE "MonitorEvent" ADD CONSTRAINT "MonitorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorEvent" ADD CONSTRAINT "MonitorEvent_watchAddressId_fkey" FOREIGN KEY ("watchAddressId") REFERENCES "WatchAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_watchAddressId_fkey" FOREIGN KEY ("watchAddressId") REFERENCES "WatchAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

