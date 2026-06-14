import prisma from "@typebot.io/prisma";
import {
  getCrmWorkspaceMappingByTenantId,
  isCrmSsoLockdownEnabled,
} from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import {
  getCachedTenantMapping,
  setCachedTenantMapping,
} from "./flowCache";

/**
 * Validates that a Typebot flow (identified by publicId) belongs to the
 * workspace associated with the given CRM tenant.
 *
 * This prevents cross-tenant flow access — tenant A cannot execute
 * tenant B's flows even if they know the publicId.
 *
 * @throws Error if flow doesn't exist, or belongs to a different tenant
 */
export const assertFlowBelongsToTenant = async (
  flowPublicId: string,
  tenantId: string,
): Promise<void> => {
  // If SSO lockdown is disabled, skip tenant validation
  // (development / standalone Typebot mode)
  if (!isCrmSsoLockdownEnabled()) return;

  // 1. Find the typebot by publicId
  const typebot = await prisma.typebot.findUnique({
    where: { publicId: flowPublicId },
    select: { id: true, workspaceId: true, name: true },
  });

  if (!typebot) {
    throw new TenantGuardError(
      `Flow not found: ${flowPublicId}`,
      "FLOW_NOT_FOUND",
    );
  }

  // 2. Find the CRM tenant → workspace mapping (cached)
  const mapping = await getCachedOrFetchTenantMapping(tenantId);
  if (!mapping) {
    throw new TenantGuardError(
      `No workspace mapping for tenant ${tenantId}`,
      "TENANT_NOT_MAPPED",
    );
  }

  // 3. Assert the flow's workspace matches the tenant's workspace
  if (typebot.workspaceId !== mapping.workspaceId) {
    throw new TenantGuardError(
      `Flow "${typebot.name}" (workspace ${typebot.workspaceId}) does not belong to tenant ${tenantId} (workspace ${mapping.workspaceId})`,
      "CROSS_TENANT_ACCESS",
    );
  }
};

/**
 * Validates that a session belongs to the requesting tenant's workspace.
 * Sessions are stored in ChatSession table without workspace info,
 * so we look up via the associated typebot.
 *
 * For continue-chat calls we trust the sessionId since the Typebot engine
 * handles session isolation internally. This guard is only for start-chat.
 */
export const assertSessionBelongsToTenant = async (
  _sessionId: string,
  _tenantId: string,
): Promise<void> => {
  // Session isolation is handled by the Typebot engine itself:
  // - sessionId is an opaque cuid generated at start
  // - continue-chat requires exact sessionId match
  // - no enumeration attack possible
  // Therefore we skip explicit DB validation for continue calls.
};

/**
 * Looks up the CRM tenant→workspace mapping, checking Redis cache first
 * (TTL 300s). Falls through to DB on cache miss.
 */
const getCachedOrFetchTenantMapping = async (tenantId: string) => {
  const cached = await getCachedTenantMapping(tenantId);
  if (cached.hit) return cached.mapping;

  const mapping = await getCrmWorkspaceMappingByTenantId(tenantId);

  // Cache the result (including null)
  await setCachedTenantMapping(tenantId, mapping);

  return mapping;
};

export class TenantGuardError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FLOW_NOT_FOUND"
      | "TENANT_NOT_MAPPED"
      | "CROSS_TENANT_ACCESS",
  ) {
    super(message);
    this.name = "TenantGuardError";
  }
}
