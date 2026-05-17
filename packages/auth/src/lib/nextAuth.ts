import { env } from "@typebot.io/env";
import { datesAreOnSameDay } from "@typebot.io/lib/datesAreOnSameDay";
import { getIp } from "@typebot.io/lib/getIp";
import { isDefined } from "@typebot.io/lib/utils";
import prisma from "@typebot.io/prisma";
import {
  getTypebotCookie,
  serializeTypebotCookie,
} from "@typebot.io/telemetry/cookies/helpers";
import type { TypebotCookieValue } from "@typebot.io/telemetry/cookies/schema";
import { mergeIds } from "@typebot.io/telemetry/mergeIds";
import { trackEvents } from "@typebot.io/telemetry/trackEvents";
import { clientUserSchema } from "@typebot.io/user/schemas";
import {
  ensureCrmOwnerWorkspaceMembership,
  getCrmWorkspaceMappingByTenantId,
  getCrmWorkspaceMappingForOwnerEmail,
  normalizeCrmOwnerEmail,
  pruneCrmOwnerWorkspaceMemberships,
  touchCrmWorkspaceMapping,
} from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import type { NextRequest } from "next/server";
import NextAuth, { type NextAuthResult } from "next-auth";
import { accountHasRequiredOAuthGroups } from "../helpers/accountHasRequiredOAuthGroups";
import { createAuthPrismaAdapter } from "../helpers/createAuthPrismaAdapter";
import { isEmailLegit } from "../helpers/emailValidation";
import { getNewUserInvitations } from "../helpers/getNewUserInvitations";
import oneMinRateLimiter from "./oneMinRateLimiter";
import { providers } from "./providers";

export const SET_TYPEBOT_COOKIE_HEADER = "Set-Typebot-Cookie" as const;

const nextAuth = NextAuth((req) => ({
  adapter: createAuthPrismaAdapter(prisma),
  secret: env.ENCRYPTION_SECRET,
  providers,
  trustHost: env.VERCEL_GIT_COMMIT_SHA ? undefined : true,
  pages: {
    signIn: "/signin",
    newUser: env.NEXT_PUBLIC_ONBOARDING_TYPEBOT_ID ? "/onboarding" : undefined,
    error: "/signin",
  },
  events: {
    session: async ({ session }) => {
      if (!datesAreOnSameDay(session.user.lastActivityAt, new Date())) {
        await prisma.user.updateMany({
          where: { id: session.user.id },
          data: { lastActivityAt: new Date() },
        });
      }
      const typebotCookie = getTypebotCookieFromNextReq(req);
      if (typebotCookie) {
        if (
          typebotCookie?.landingPage?.id &&
          !typebotCookie.landingPage.isMerged
        ) {
          await mergeIds({
            visitorId: typebotCookie.landingPage.id,
            userId: session.user.id,
          });
          updateCookieIsMerged({ req, typebotCookie });
        }
      }
    },
    async signIn({ user, isNewUser, account }) {
      if (!user.id) return;
      const typebotCookie = getTypebotCookieFromNextReq(req);
      if (typebotCookie && account?.provider)
        updateCookieLastProvider(account.provider, { req, typebotCookie });
      if (isNewUser) return;
      await trackEvents([
        {
          name: "User logged in",
          userId: user.id,
        },
      ]);
    },
    async signOut(props) {
      if ("token" in props) return;
      const typebotCookie = getTypebotCookieFromNextReq(req);
      if (typebotCookie) resetLandingPageCookie({ req, typebotCookie });
      await trackEvents([
        {
          name: "User logged out",
          userId: (props.session as unknown as { userId: string }).userId,
        },
      ]);
    },
  },
  callbacks: {
    session: async ({ session, user }) => {
      const parsedUser = clientUserSchema.parse(user);

      if (!env.CRM_BOT_SSO_LOCKDOWN)
        return {
          ...session,
          user: parsedUser,
        };

      const mapping = await getCrmWorkspaceMappingForOwnerEmail(
        parsedUser.email,
      );
      if (mapping)
        await ensureCrmOwnerWorkspaceMembership({
          ownerEmail: parsedUser.email,
          workspaceId: mapping.workspaceId,
        });

      return {
        ...session,
        user: {
          ...parsedUser,
          crmTenantId: mapping?.tenantId,
          crmWorkspaceId: mapping?.workspaceId,
        },
      };
    },
    signIn: async ({ account, user, email, profile }) => {
      if (!account) return false;
      if (env.CRM_BOT_SSO_LOCKDOWN) {
        if (account.provider !== "keycloak") return false;
        await assertCrmOwnerKeycloakSignIn({
          ownerEmail: user.email,
          idToken: account.id_token,
          profile,
        });
      }
      const isNewUser = !("createdAt" in user && isDefined(user.createdAt));
      if (user.email && email?.verificationRequest) {
        const ip = req
          ? getIp({
              "x-forwarded-for": req.headers.get("x-forwarded-for"),
              "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
            })
          : null;
        if (oneMinRateLimiter && ip) {
          const { success } = await oneMinRateLimiter.limit(ip);
          if (!success) throw new Error("too-many-requests");
        }
        if (!isEmailLegit(user.email)) throw new Error("email-not-legit");
      }
      if (
        env.DISABLE_SIGNUP &&
        isNewUser &&
        user.email &&
        !env.ADMIN_EMAIL?.includes(user.email)
      ) {
        const { invitations, workspaceInvitations } =
          await getNewUserInvitations(prisma, user.email);
        if (invitations.length === 0 && workspaceInvitations.length === 0)
          throw new Error("sign-up-disabled");
      }
      return await accountHasRequiredOAuthGroups(account);
    },
  },
}));

const assertCrmOwnerKeycloakSignIn = async ({
  ownerEmail,
  idToken,
  profile,
}: {
  ownerEmail?: string | null;
  idToken?: string | null;
  profile?: unknown;
}) => {
  if (!ownerEmail) throw new Error("crm-owner-email-missing");

  const tenantId =
    getTenantIdFromClaims(profile) ?? getTenantIdFromJwt(idToken);
  if (!tenantId) throw new Error("crm-tenant-id-missing");

  const mapping = await getCrmWorkspaceMappingByTenantId(tenantId);
  if (!mapping) throw new Error("crm-workspace-not-provisioned");

  const normalizedEmail = normalizeCrmOwnerEmail(ownerEmail);
  if (mapping.ownerEmail !== normalizedEmail)
    throw new Error("crm-workspace-owner-only");

  await touchCrmWorkspaceMapping(mapping.tenantId);
  await pruneCrmOwnerWorkspaceMemberships({
    ownerEmail: normalizedEmail,
    workspaceId: mapping.workspaceId,
  });
};

const getTenantIdFromClaims = (claimsLike: unknown) => {
  if (!claimsLike || typeof claimsLike !== "object") return;

  const claims = claimsLike as Record<string, unknown>;
  const tenantId = claims.tenantId ?? claims.tenant_id;

  return typeof tenantId === "string" && tenantId.trim().length > 0
    ? tenantId.trim()
    : undefined;
};

const getTenantIdFromJwt = (idToken?: string | null) => {
  if (!idToken) return;

  try {
    const [, payload] = idToken.split(".");
    if (!payload) return;
    return getTenantIdFromClaims(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    return;
  }
};

const updateCookieIsMerged = ({
  req,
  typebotCookie,
}: {
  req: NextRequest | undefined;
  typebotCookie: TypebotCookieValue;
}) => {
  if (!isValidNextRequest(req) || !typebotCookie.landingPage) return;
  req.headers.set(
    SET_TYPEBOT_COOKIE_HEADER,
    serializeTypebotCookie({
      ...typebotCookie,
      landingPage: {
        ...typebotCookie.landingPage,
        isMerged: true,
      },
    }),
  );
};

const updateCookieLastProvider = (
  provider: string,
  {
    req,
    typebotCookie,
  }: { req: NextRequest | undefined; typebotCookie: TypebotCookieValue },
) => {
  if (!isValidNextRequest(req)) return;
  req.headers.set(
    SET_TYPEBOT_COOKIE_HEADER,
    serializeTypebotCookie({
      ...typebotCookie,
      lastProvider: provider,
    }),
  );
};

const resetLandingPageCookie = ({
  req,
  typebotCookie,
}: {
  req: NextRequest | undefined;
  typebotCookie: TypebotCookieValue;
}) => {
  if (!isValidNextRequest(req)) return;
  req.headers.set(
    SET_TYPEBOT_COOKIE_HEADER,
    serializeTypebotCookie({
      ...typebotCookie,
      lastProvider: undefined,
      landingPage: undefined,
    }),
  );
};

const getTypebotCookieFromNextReq = (
  req: NextRequest | undefined,
): TypebotCookieValue | null => {
  if (!isValidNextRequest(req)) return null;
  const cookieStr = req.headers.get("cookie");
  if (!cookieStr) return null;
  return getTypebotCookie(cookieStr);
};

// Nextauth req type is not correct, so we need to assert it
const isValidNextRequest = (
  req: NextRequest | undefined,
): req is NextRequest => {
  return Boolean(req && "headers" in req && "get" in req.headers);
};

export const authHandlers = nextAuth.handlers;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
