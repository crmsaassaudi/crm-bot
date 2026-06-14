import { ORPCError } from "@orpc/server";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { getAllCrmWorkspaceMappingsForOwnerEmail } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";

export const handleListWorkspaces = async ({
  context: { user },
}: {
  context: { user: Pick<User, "id" | "email"> };
}) => {
  if (env.CRM_BOT_SSO_LOCKDOWN) {
    const mappings = await getAllCrmWorkspaceMappingsForOwnerEmail(user.email);
    if (mappings.length === 0) return { workspaces: [] };

    const workspaceIds = mappings.map((m) => m.workspaceId);

    const workspaces = await prisma.workspace.findMany({
      where: {
        id: { in: workspaceIds },
        members: { some: { userId: user.id } },
      },
      select: { name: true, id: true, icon: true, plan: true },
    });

    return { workspaces };
  }

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    select: { name: true, id: true, icon: true, plan: true },
  });

  if (!workspaces)
    throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });

  return { workspaces };
};
