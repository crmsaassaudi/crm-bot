import { ORPCError } from "@orpc/server";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { getAllCrmWorkspaceMappingsForOwnerEmail } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import { z } from "zod";

export const updateChannelBindingsInputSchema = z.object({
  typebotId: z.string().min(1),
  channelIds: z.array(z.string().min(1)),
});

export const handleUpdateChannelBindings = async ({
  input: { typebotId, channelIds },
  context: { user },
}: {
  input: z.infer<typeof updateChannelBindingsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  if (!env.CRM_BOT_SSO_LOCKDOWN)
    throw new ORPCError("FORBIDDEN", { message: "CRM mode not enabled" });

  // Resolve tenantId from typebot's workspace
  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: { workspaceId: true },
  });
  if (!typebot)
    throw new ORPCError("NOT_FOUND", { message: "Typebot not found" });

  const mappings = await getAllCrmWorkspaceMappingsForOwnerEmail(user.email);
  const mapping = mappings.find((m) => m.workspaceId === typebot.workspaceId);
  if (!mapping)
    throw new ORPCError("FORBIDDEN", {
      message: "Workspace not mapped to a CRM tenant",
    });

  const tenantId = mapping.tenantId;

  // Transaction: replace bindings for this flow
  await prisma.$transaction(async (tx) => {
    // Remove existing bindings for this flow
    await tx.crmChannelFlowBinding.deleteMany({
      where: { tenantId, typebotId },
    });

    // Remove any bindings where these channels are bound to OTHER flows
    // (1 channel = 1 flow constraint)
    if (channelIds.length > 0) {
      await tx.crmChannelFlowBinding.deleteMany({
        where: { tenantId, channelId: { in: channelIds } },
      });

      // Create new bindings
      await tx.crmChannelFlowBinding.createMany({
        data: channelIds.map((channelId) => ({
          tenantId,
          channelId,
          typebotId,
        })),
      });
    }
  });

  return { ok: true, channelIds };
};
