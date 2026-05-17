import type { ClientUser } from "@typebot.io/user/schemas";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: ClientUser & {
      crmTenantId?: string;
      crmWorkspaceId?: string;
    };
  }
}
