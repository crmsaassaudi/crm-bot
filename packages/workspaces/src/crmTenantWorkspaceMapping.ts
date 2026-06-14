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

/**
 * Returns ALL workspace mappings for an owner email.
 * Used by handleListWorkspaces to show multi-tenant users all their workspaces.
 */
export const getAllCrmWorkspaceMappingsForOwnerEmail = async (
  ownerEmail: string,
  client: PrismaLike = prisma,
) => {
  return (await client.$queryRaw`
    SELECT "id", "tenantId", "workspaceId", "ownerEmail", "createdAt", "updatedAt"
    FROM "CrmTenantWorkspaceMapping"
    WHERE "ownerEmail" = ${normalizeCrmOwnerEmail(ownerEmail)}
    ORDER BY "updatedAt" DESC
  `) as CrmTenantWorkspaceMapping[];
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

  const mappings = await getAllCrmWorkspaceMappingsForOwnerEmail(ownerEmail);
  if (!mappings.some((m) => m.workspaceId === workspaceId)) {
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

/**
 * Ensures the user has memberships for ALL their CRM workspaces,
 * and removes memberships for workspaces NOT in any CRM mapping.
 */
export const syncCrmOwnerWorkspaceMemberships = async ({
  ownerEmail,
}: {
  ownerEmail: string;
}) => {
  if (!isCrmSsoLockdownEnabled()) return;

  const normalizedEmail = normalizeCrmOwnerEmail(ownerEmail);
  const owner = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!owner) return;

  const mappings = await getAllCrmWorkspaceMappingsForOwnerEmail(ownerEmail);
  const mappedWorkspaceIds = mappings.map((m) => m.workspaceId);

  // Ensure membership for every mapped workspace
  for (const wsId of mappedWorkspaceIds) {
    await ensureCrmOwnerWorkspaceMembership({
      ownerEmail: normalizedEmail,
      workspaceId: wsId,
    });
  }

  // Remove memberships for workspaces NOT in any CRM mapping
  if (mappedWorkspaceIds.length > 0) {
    await prisma.memberInWorkspace.deleteMany({
      where: {
        userId: owner.id,
        workspaceId: { notIn: mappedWorkspaceIds },
      },
    });
  }
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
 * Uses the same data format as Typebot's official handleCreateTypebot.
 *
 * The flow has 2 groups:
 * 1. Greeting text bubble + choice input
 * 2. Handoff text
 *
 * The bot is auto-published so it's immediately available.
 */
const createDefaultWelcomeBot = async (
  tx: PrismaLike,
  workspaceId: string,
) => {
  const greetingGroupId = randomUUID();
  const handoffGroupId = randomUUID();
  const startEventId = randomUUID();
  const edgeId = randomUUID();

  // V6 format: events array with start event (no "start" block in groups)
  const events = [
    {
      id: startEventId,
      type: "start" as const,
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: edgeId,
    },
  ];

  const groups = [
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
      ],
    },
  ];

  // Edge from start event to greeting group
  const edges = [
    {
      id: edgeId,
      from: { eventId: startEventId },
      to: { groupId: greetingGroupId },
    },
  ];

  const publicId = `welcome-bot-${workspaceId.substring(0, 8)}`;

  const typebot = await tx.typebot.create({
    data: {
      version: "6.1",
      name: "Welcome Bot",
      icon: "🤖",
      workspaceId,
      publicId,
      groups,
      events,
      variables: [],
      edges,
      theme: {},
      settings: {},
      folderId: null,
      selectedThemeTemplateId: null,
      customDomain: null,
      whatsAppCredentialsId: null,
      resultsTablePreferences: null,
      riskLevel: null,
      isArchived: false,
      isClosed: false,
    },
    select: { id: true },
  });

  // Auto-publish the welcome bot
  await tx.publicTypebot.create({
    data: {
      typebotId: typebot.id,
      version: "6.1",
      groups,
      events,
      variables: [],
      edges,
      theme: {},
      settings: {},
    },
  });
};
