import prisma from "@typebot.io/prisma";
import { getCrmWorkspaceMappingByTenantId } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import { getCachedFlow, setCachedFlow } from "./flowCache";

/**
 * Resolves the active Typebot flow for a CRM tenant + channel.
 *
 * Resolution strategy:
 * 1. If channelId provided → find CrmChannelFlowBinding (exact match)
 * 2. If no binding found → fallback to default (first published flow in workspace)
 * 3. If no channelId → fallback to default
 *
 * Results are cached in Redis (TTL 60s) to avoid repeated DB hits
 * on high-volume bot traffic.
 *
 * Returns null if no matching flow → caller should SKIP bot processing.
 */
export const resolveFlowForTenant = async (
  tenantId: string,
  channelId?: string,
): Promise<{ publicId: string; typebotId: string; name: string } | null> => {
  // 1. Check cache first
  const cached = await getCachedFlow(tenantId, channelId);
  if (cached.hit) return cached.flow;

  // 2. Resolve from DB
  const flow = await resolveFlowFromDb(tenantId, channelId);

  // 3. Cache the result (including null = "no flow found")
  await setCachedFlow(tenantId, channelId, flow);

  return flow;
};

const resolveFlowFromDb = async (
  tenantId: string,
  channelId?: string,
): Promise<{ publicId: string; typebotId: string; name: string } | null> => {
  // Channel-specific binding (highest priority)
  if (channelId) {
    // Single joined query instead of 2 sequential Prisma calls.
    // Also avoids generated type dependency on CrmChannelFlowBinding model.
    const rows = (await prisma.$queryRaw`
      SELECT t."id" AS "typebotId", t."publicId", t."name"
      FROM "CrmChannelFlowBinding" b
      JOIN "Typebot" t ON t."id" = b."typebotId"
      WHERE b."tenantId" = ${tenantId}
        AND b."channelId" = ${channelId}
        AND t."isArchived" = false
        AND EXISTS (SELECT 1 FROM "PublicTypebot" pt WHERE pt."typebotId" = t."id")
      LIMIT 1
    `) as { typebotId: string; publicId: string | null; name: string }[];

    const row = rows[0];
    if (row?.publicId) {
      return {
        publicId: row.publicId,
        typebotId: row.typebotId,
        name: row.name,
      };
    }

    // Channel has no binding → SKIP (no fallback)
    return null;
  }

  // No channelId provided → fallback to first published flow (backward compat)
  const mapping = await getCrmWorkspaceMappingByTenantId(tenantId);
  if (!mapping) return null;

  const typebot = await prisma.typebot.findFirst({
    where: {
      workspaceId: mapping.workspaceId,
      isArchived: false,
      publishedTypebot: { isNot: null },
    },
    select: {
      id: true,
      publicId: true,
      name: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!typebot?.publicId) return null;

  return {
    publicId: typebot.publicId,
    typebotId: typebot.id,
    name: typebot.name,
  };
};
