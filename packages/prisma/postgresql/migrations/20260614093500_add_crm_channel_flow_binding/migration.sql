-- CreateTable
CREATE TABLE "CrmChannelFlowBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "typebotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmChannelFlowBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmChannelFlowBinding_tenantId_channelId_key" ON "CrmChannelFlowBinding"("tenantId", "channelId");

-- CreateIndex
CREATE INDEX "CrmChannelFlowBinding_tenantId_typebotId_idx" ON "CrmChannelFlowBinding"("tenantId", "typebotId");

-- AddForeignKey
ALTER TABLE "CrmChannelFlowBinding"
ADD CONSTRAINT "CrmChannelFlowBinding_typebotId_fkey"
FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
