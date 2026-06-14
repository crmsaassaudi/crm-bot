import prisma from "@typebot.io/prisma";
import { getCrmWorkspaceMappingByTenantId } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";

/**
 * Resolves the active Typebot flow for a CRM tenant + channel.
 *
 * Resolution strategy:
 * 1. If channelId provided → find CrmChannelFlowBinding (exact match)
 * 2. If no binding found → fallback to default (first published flow in workspace)
 * 3. If no channelId → fallback to default
 *
 * Returns null if no matching flow → caller should SKIP bot processing.
 */
export const resolveFlowForTenant = async (
  tenantId: string,
  channelId?: string,
): Promise<{ publicId: string; typebotId: string; name: string } | null> => {
  // 1. Channel-specific binding (highest priority)
  if (channelId) {
    const binding = await prisma.crmChannelFlowBinding.findUnique({
      where: { tenantId_channelId: { tenantId, channelId } },
    });

    if (binding) {
      const typebot = await prisma.typebot.findFirst({
        where: {
          id: binding.typebotId,
          isArchived: false,
          publishedTypebot: { isNot: null },
        },
        select: { id: true, publicId: true, name: true },
      });

      if (typebot?.publicId) {
        return {
          publicId: typebot.publicId,
          typebotId: typebot.id,
          name: typebot.name,
        };
      }
    }

    // Channel has no binding → SKIP (no fallback)
    return null;
  }

  // 2. No channelId provided → fallback to first published flow (backward compat)
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
