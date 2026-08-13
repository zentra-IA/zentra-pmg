-- Zentra Sales AI - Discador Comercial V1
-- Migração ADITIVA: cria apenas tabelas/índices novos.
-- Não remove nem altera dados das tabelas existentes.

CREATE TABLE "DialerCampaign" (
    "id" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DialerCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DialerCampaignContact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastCallAt" TIMESTAMP(3),
    "nextCallAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialerCampaignContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DialerCall" (
    "id" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignContactId" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialerCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DialerCampaignContact_campaignId_prospectId_key"
ON "DialerCampaignContact"("campaignId", "prospectId");

CREATE INDEX "DialerCampaign_company_id_idx"
ON "DialerCampaign"("company_id");

CREATE INDEX "DialerCampaign_company_id_user_id_idx"
ON "DialerCampaign"("company_id", "user_id");

CREATE INDEX "DialerCampaign_status_idx"
ON "DialerCampaign"("status");

CREATE INDEX "DialerCampaign_createdAt_idx"
ON "DialerCampaign"("createdAt");

CREATE INDEX "DialerCampaignContact_campaignId_position_idx"
ON "DialerCampaignContact"("campaignId", "position");

CREATE INDEX "DialerCampaignContact_prospectId_idx"
ON "DialerCampaignContact"("prospectId");

CREATE INDEX "DialerCampaignContact_status_idx"
ON "DialerCampaignContact"("status");

CREATE INDEX "DialerCampaignContact_nextCallAt_idx"
ON "DialerCampaignContact"("nextCallAt");

CREATE INDEX "DialerCall_company_id_idx"
ON "DialerCall"("company_id");

CREATE INDEX "DialerCall_company_id_user_id_idx"
ON "DialerCall"("company_id", "user_id");

CREATE INDEX "DialerCall_campaignId_idx"
ON "DialerCall"("campaignId");

CREATE INDEX "DialerCall_campaignContactId_idx"
ON "DialerCall"("campaignContactId");

CREATE INDEX "DialerCall_result_idx"
ON "DialerCall"("result");

CREATE INDEX "DialerCall_createdAt_idx"
ON "DialerCall"("createdAt");

ALTER TABLE "DialerCampaign"
ADD CONSTRAINT "DialerCampaign_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "DialerCampaignContact"
ADD CONSTRAINT "DialerCampaignContact_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "DialerCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DialerCampaignContact"
ADD CONSTRAINT "DialerCampaignContact_prospectId_fkey"
FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DialerCall"
ADD CONSTRAINT "DialerCall_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "DialerCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DialerCall"
ADD CONSTRAINT "DialerCall_campaignContactId_fkey"
FOREIGN KEY ("campaignContactId") REFERENCES "DialerCampaignContact"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DialerCall"
ADD CONSTRAINT "DialerCall_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
