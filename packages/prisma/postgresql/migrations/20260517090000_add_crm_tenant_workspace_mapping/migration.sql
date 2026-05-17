CREATE TABLE "CrmTenantWorkspaceMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTenantWorkspaceMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmTenantWorkspaceMapping_tenantId_key" ON "CrmTenantWorkspaceMapping"("tenantId");

CREATE UNIQUE INDEX "CrmTenantWorkspaceMapping_workspaceId_key" ON "CrmTenantWorkspaceMapping"("workspaceId");

CREATE INDEX "CrmTenantWorkspaceMapping_ownerEmail_idx" ON "CrmTenantWorkspaceMapping"("ownerEmail");

ALTER TABLE "CrmTenantWorkspaceMapping"
ADD CONSTRAINT "CrmTenantWorkspaceMapping_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
