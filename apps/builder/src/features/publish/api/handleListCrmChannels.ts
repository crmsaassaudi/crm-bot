import { ORPCError } from "@orpc/server";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { getAllCrmWorkspaceMappingsForOwnerEmail } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import { z } from "zod";

export const listCrmChannelsInputSchema = z.object({
  typebotId: z.string().min(1),
});

type CrmChannel = {
  id: string;
  name: string;
  type: string;
  account?: string;
  status?: string;
  isBound: boolean;
};

export const handleListCrmChannels = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof listCrmChannelsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}): Promise<{ channels: CrmChannel[] }> => {
  if (!env.CRM_BOT_SSO_LOCKDOWN)
    return { channels: [] };

  // Resolve tenantId from typebot's workspace
  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: { workspaceId: true },
  });
  if (!typebot)
    throw new ORPCError("NOT_FOUND", { message: "Typebot not found" });

  const mappings = await getAllCrmWorkspaceMappingsForOwnerEmail(user.email);
  const mapping = mappings.find((m) => m.workspaceId === typebot.workspaceId);
  if (!mapping) return { channels: [] };

  const tenantId = mapping.tenantId;

  // Fetch channels from crm-api
  const crmChannels = await fetchCrmApiChannels(tenantId);

  // Fetch existing bindings for this typebot
  const bindings = await prisma.crmChannelFlowBinding.findMany({
    where: { tenantId, typebotId },
    select: { channelId: true },
  });
  const boundChannelIds = new Set(bindings.map((b) => b.channelId));

  return {
    channels: crmChannels.map((ch) => ({
      ...ch,
      isBound: boundChannelIds.has(ch.id),
    })),
  };
};

async function fetchCrmApiChannels(
  tenantId: string,
): Promise<{ id: string; name: string; type: string; account?: string; status?: string }[]> {
  const baseUrl = env.CRM_API_INTERNAL_URL;
  if (!baseUrl || !env.CRM_BOT_INTERNAL_SECRET) return [];

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/internal/channels?tenantId=${encodeURIComponent(tenantId)}`,
      {
        headers: {
          "x-crm-internal-secret": env.CRM_BOT_INTERNAL_SECRET,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}
