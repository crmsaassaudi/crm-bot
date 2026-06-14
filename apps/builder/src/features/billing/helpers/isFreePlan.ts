import { env } from "@typebot.io/env";
import { isNotDefined } from "@typebot.io/lib/utils";
import { Plan } from "@typebot.io/prisma/enum";
import type { Workspace } from "@typebot.io/workspaces/schemas";

export const isFreePlan = (workspace?: Pick<Workspace, "plan">) => {
  // CRM mode: all features unlocked regardless of plan
  if (env.CRM_BOT_SSO_LOCKDOWN) return false;
  return isNotDefined(workspace) || workspace?.plan === Plan.FREE;
};
