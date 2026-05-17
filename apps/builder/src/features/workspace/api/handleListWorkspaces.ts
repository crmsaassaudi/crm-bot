import { ORPCError } from "@orpc/server";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { getCrmWorkspaceMappingForOwnerEmail } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";

export const handleListWorkspaces = async ({
  context: { user },
}: {
  context: { user: Pick<User, "id" | "email"> };
}) => {
  if (env.CRM_BOT_SSO_LOCKDOWN) {
    const mapping = await getCrmWorkspaceMappingForOwnerEmail(user.email);
    if (!mapping) return { workspaces: [] };

    const workspaces = await prisma.workspace.findMany({
      where: {
        id: mapping.workspaceId,
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
