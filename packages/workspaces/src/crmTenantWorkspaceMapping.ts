import { randomUUID } from "node:crypto";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";

export type CrmTenantWorkspaceMapping = {
  id: string;
  tenantId: string;
  workspaceId: string;
  ownerEmail: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaLike = typeof prisma | any;

export type ProvisionCrmTenantWorkspaceInput = {
  tenantId: string;
  ownerEmail: string;
  ownerName: string;
  tenantName?: string;
};

export const isCrmSsoLockdownEnabled = () => env.CRM_BOT_SSO_LOCKDOWN === true;

export const normalizeCrmOwnerEmail = (email: string) =>
  email.trim().toLowerCase();

export const getCrmWorkspaceMappingByTenantId = async (
  tenantId: string,
  client: PrismaLike = prisma,
) => {
  const rows = (await client.$queryRaw`
    SELECT "id", "tenantId", "workspaceId", "ownerEmail", "createdAt", "updatedAt"
    FROM "CrmTenantWorkspaceMapping"
    WHERE "tenantId" = ${tenantId}
    LIMIT 1
  `) as CrmTenantWorkspaceMapping[];

  return rows[0] ?? null;
};

export const getCrmWorkspaceMappingByWorkspaceId = async (
  workspaceId: string,
  client: PrismaLike = prisma,
) => {
  const rows = (await client.$queryRaw`
    SELECT "id", "tenantId", "workspaceId", "ownerEmail", "createdAt", "updatedAt"
    FROM "CrmTenantWorkspaceMapping"
    WHERE "workspaceId" = ${workspaceId}
    LIMIT 1
  `) as CrmTenantWorkspaceMapping[];

  return rows[0] ?? null;
};

export const getCrmWorkspaceMappingForOwnerEmail = async (
  ownerEmail: string,
  client: PrismaLike = prisma,
) => {
  const rows = (await client.$queryRaw`
    SELECT "id", "tenantId", "workspaceId", "ownerEmail", "createdAt", "updatedAt"
    FROM "CrmTenantWorkspaceMapping"
    WHERE "ownerEmail" = ${normalizeCrmOwnerEmail(ownerEmail)}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `) as CrmTenantWorkspaceMapping[];

  return rows[0] ?? null;
};

export const touchCrmWorkspaceMapping = async (
  tenantId: string,
  client: PrismaLike = prisma,
) => {
  await client.$executeRaw`
    UPDATE "CrmTenantWorkspaceMapping"
    SET "updatedAt" = ${new Date()}
    WHERE "tenantId" = ${tenantId}
  `;
};

export const assertCrmOwnerWorkspaceAccess = async ({
  ownerEmail,
  workspaceId,
}: {
  ownerEmail: string | null | undefined;
  workspaceId: string;
}) => {
  if (!isCrmSsoLockdownEnabled()) return;
  if (!ownerEmail) throw new Error("crm-workspace-owner-required");

  const mapping = await getCrmWorkspaceMappingForOwnerEmail(ownerEmail);
  if (!mapping || mapping.workspaceId !== workspaceId) {
    throw new Error("crm-workspace-forbidden");
  }
};

export const isCrmOwnerWorkspaceForbidden = async ({
  ownerEmail,
  workspaceId,
}: {
  ownerEmail: string | null | undefined;
  workspaceId: string;
}) => {
  try {
    await assertCrmOwnerWorkspaceAccess({ ownerEmail, workspaceId });
    return false;
  } catch {
    return true;
  }
};

export const ensureCrmOwnerWorkspaceMembership = async ({
  ownerEmail,
  workspaceId,
  client = prisma,
}: {
  ownerEmail: string;
  workspaceId: string;
  client?: PrismaLike;
}) => {
  const normalizedEmail = normalizeCrmOwnerEmail(ownerEmail);
  const owner = await client.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!owner) return;

  await client.memberInWorkspace.upsert({
    where: {
      userId_workspaceId: {
        userId: owner.id,
        workspaceId,
      },
    },
    create: {
      userId: owner.id,
      workspaceId,
      role: "ADMIN",
    },
    update: {
      role: "ADMIN",
    },
  });
};

export const pruneCrmOwnerWorkspaceMemberships = async ({
  ownerEmail,
  workspaceId,
}: {
  ownerEmail: string;
  workspaceId: string;
}) => {
  if (!isCrmSsoLockdownEnabled()) return;

  const normalizedEmail = normalizeCrmOwnerEmail(ownerEmail);
  const owner = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!owner) return;

  await prisma.memberInWorkspace.deleteMany({
    where: {
      userId: owner.id,
      workspaceId: { not: workspaceId },
    },
  });

  await ensureCrmOwnerWorkspaceMembership({ ownerEmail, workspaceId });
};

export const provisionCrmTenantWorkspace = async ({
  tenantId,
  ownerEmail,
  ownerName,
  tenantName,
}: ProvisionCrmTenantWorkspaceInput) => {
  const normalizedEmail = normalizeCrmOwnerEmail(ownerEmail);

  return prisma.$transaction(async (tx) => {
    const existing = await getCrmWorkspaceMappingByTenantId(tenantId, tx);
    if (existing) {
      await ensureCrmOwnerWorkspaceMembership({
        ownerEmail: normalizedEmail,
        workspaceId: existing.workspaceId,
        client: tx,
      });
      return existing;
    }

    const owner = await tx.user.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        name: ownerName,
        onboardingCategories: [],
      },
      update: ownerName ? { name: ownerName } : {},
      select: { id: true },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: tenantName?.trim() || `${ownerName}'s workspace`,
        members: {
          create: [{ role: "ADMIN", userId: owner.id }],
        },
      },
      select: { id: true },
    });

    // Create default welcome bot flow for new tenant
    await createDefaultWelcomeBot(tx, workspace.id);

    const now = new Date();
    const mapping: CrmTenantWorkspaceMapping = {
      id: randomUUID(),
      tenantId,
      workspaceId: workspace.id,
      ownerEmail: normalizedEmail,
      createdAt: now,
      updatedAt: now,
    };

    await tx.$executeRaw`
      INSERT INTO "CrmTenantWorkspaceMapping"
        ("id", "tenantId", "workspaceId", "ownerEmail", "createdAt", "updatedAt")
      VALUES
        (${mapping.id}, ${mapping.tenantId}, ${mapping.workspaceId}, ${mapping.ownerEmail}, ${mapping.createdAt}, ${mapping.updatedAt})
    `;

    return mapping;
  });
};

/**
 * Creates a default "Welcome Bot" flow in the tenant's workspace.
 * The flow has 3 steps:
 * 1. Greeting text bubble
 * 2. Choice input (Talk to agent / Continue)
 * 3. Handoff block (if user chooses agent)
 *
 * The bot is auto-published so it's immediately available for channel assignment.
 */
const createDefaultWelcomeBot = async (
  tx: PrismaLike,
  workspaceId: string,
) => {
  const startGroupId = randomUUID();
  const greetingGroupId = randomUUID();
  const handoffGroupId = randomUUID();

  const groups = [
    {
      id: startGroupId,
      title: "Start",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: randomUUID(),
          type: "start",
          groupId: startGroupId,
        },
      ],
    },
    {
      id: greetingGroupId,
      title: "Greeting",
      graphCoordinates: { x: 400, y: 0 },
      blocks: [
        {
          id: randomUUID(),
          type: "text",
          groupId: greetingGroupId,
          content: {
            richText: [
              {
                type: "p",
                children: [
                  {
                    text: "👋 Xin chào! Tôi là trợ lý ảo. Tôi có thể giúp gì cho bạn?",
                  },
                ],
              },
            ],
          },
        },
        {
          id: randomUUID(),
          type: "choice input",
          groupId: greetingGroupId,
          items: [
            {
              id: randomUUID(),
              content: "Nói chuyện với tư vấn viên",
            },
            {
              id: randomUUID(),
              content: "Tôi muốn tìm hiểu thêm",
            },
          ],
        },
      ],
    },
    {
      id: handoffGroupId,
      title: "Handoff",
      graphCoordinates: { x: 800, y: 0 },
      blocks: [
        {
          id: randomUUID(),
          type: "text",
          groupId: handoffGroupId,
          content: {
            richText: [
              {
                type: "p",
                children: [
                  {
                    text: "Đang chuyển bạn đến tư vấn viên. Vui lòng chờ trong giây lát...",
                  },
                ],
              },
            ],
          },
        },
        {
          id: randomUUID(),
          type: "Set variable",
          groupId: handoffGroupId,
          options: {
            variableId: undefined,
            expressionToEvaluate: undefined,
            type: "Custom",
          },
          content: {
            // Signal handoff to crm-api
            handoff: true,
            event: "handoff_to_agent",
          },
        },
      ],
    },
  ];

  const publicId = `welcome-bot-${workspaceId.substring(0, 8)}`;

  const typebot = await tx.typebot.create({
    data: {
      name: "Welcome Bot",
      icon: "🤖",
      workspaceId,
      publicId,
      groups,
      variables: [],
      edges: [],
      theme: {},
      settings: {},
    },
    select: { id: true },
  });

  // Auto-publish the welcome bot
  await tx.publicTypebot.create({
    data: {
      typebotId: typebot.id,
      groups,
      variables: [],
      edges: [],
      theme: {},
      settings: {},
    },
  });
};
