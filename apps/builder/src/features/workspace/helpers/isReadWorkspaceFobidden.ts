import { env } from "@typebot.io/env";
import type { Prisma } from "@typebot.io/prisma/types";

export const isReadWorkspaceFobidden = (
  workspace: {
    members: Pick<Prisma.MemberInWorkspace, "userId">[];
  },
  user: Pick<Prisma.User, "email" | "id">,
) => {
  if (
    (!env.CRM_BOT_SSO_LOCKDOWN &&
      env.ADMIN_EMAIL?.some((email) => email === user.email)) ||
    workspace.members.find((member) => member.userId === user.id)
  )
    return false;
  return true;
};
