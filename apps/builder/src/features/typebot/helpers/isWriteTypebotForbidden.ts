import { CollaborationType } from "@typebot.io/prisma/enum";
import type { Prisma } from "@typebot.io/prisma/types";
import {
  isCrmOwnerWorkspaceForbidden,
  isCrmSsoLockdownEnabled,
} from "@typebot.io/workspaces/crmTenantWorkspaceMapping";

export const isWriteTypebotForbidden = async (
  typebot: {
    workspaceId?: string;
    collaborators: Pick<Prisma.CollaboratorsOnTypebots, "userId" | "type">[];
  } & {
    workspace: Pick<Prisma.Workspace, "isSuspended" | "isPastDue"> & {
      id?: string;
      members: Pick<Prisma.MemberInWorkspace, "userId" | "role">[];
    };
  },
  user: Pick<Prisma.User, "id" | "email">,
) => {
  const workspaceId = typebot.workspace.id ?? typebot.workspaceId;

  // CRM lockdown: if workspaceId is available, verify ownership; skip if not selected
  const crmForbidden =
    isCrmSsoLockdownEnabled() && workspaceId
      ? await isCrmOwnerWorkspaceForbidden({
          ownerEmail: user.email,
          workspaceId,
        })
      : false;

  return (
    crmForbidden ||
    typebot.workspace.isSuspended ||
    typebot.workspace.isPastDue ||
    (!typebot.collaborators.some(
      (collaborator) =>
        collaborator.userId === user.id &&
        collaborator.type === CollaborationType.WRITE,
    ) &&
      !typebot.workspace.members.some(
        (m) => m.userId === user.id && m.role !== "GUEST",
      ))
  );
};
