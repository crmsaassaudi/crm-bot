import prisma from "@typebot.io/prisma";
import { getCrmWorkspaceMappingByTenantId } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";

/**
 * Resolves the active Typebot flow for a CRM tenant.
 *
 * The bot decides which flow to run — CRM only sends ON/OFF.
 * Resolution strategy:
 * 1. Find the tenant's workspace via CrmTenantWorkspaceMapping
 * 2. Find the first published, non-archived typebot in that workspace
 * 3. Return its publicId for the Typebot engine
 *
 * Future: support multiple flows per workspace with channel-based routing.
 */
export const resolveFlowForTenant = async (
  tenantId: string,
): Promise<{ publicId: string; typebotId: string; name: string } | null> => {
  // 1. Resolve tenant → workspace mapping
  const mapping = await getCrmWorkspaceMappingByTenantId(tenantId);
  if (!mapping) return null;

  // 2. Find a published typebot in this workspace
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
