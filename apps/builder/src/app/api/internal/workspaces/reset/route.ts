import { isAuthorizedCrmInternalRequest } from "@typebot.io/auth/helpers/isAuthorizedCrmInternalRequest";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DELETE /api/internal/workspaces/reset
 * Deletes ALL CrmTenantWorkspaceMapping entries, their workspaces, and all related data.
 * This is a destructive operation — use with caution.
 */
export async function DELETE(request: NextRequest) {
  try {
    // SAFETY: Block this destructive endpoint in production
    if (env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reset API is disabled in production. Use database tools directly.",
        },
        { status: 403 },
      );
    }

    if (!isAuthorizedCrmInternalRequest(request))
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    // Require explicit confirmation header to prevent accidental invocations
    const confirmHeader = request.headers.get("x-crm-reset-confirm");
    if (confirmHeader !== "DELETE_ALL_CRM_DATA") {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing confirmation. Set header: x-crm-reset-confirm: DELETE_ALL_CRM_DATA',
        },
        { status: 400 },
      );
    }

    // Get all CRM workspace mappings
    const mappings = (await prisma.$queryRaw`
      SELECT "id", "tenantId", "workspaceId", "ownerEmail"
      FROM "CrmTenantWorkspaceMapping"
    `) as { id: string; tenantId: string; workspaceId: string; ownerEmail: string }[];

    const deleted: string[] = [];

    for (const m of mappings) {
      // Delete channel flow bindings
      await prisma.$executeRaw`
        DELETE FROM "CrmChannelFlowBinding" WHERE "tenantId" = ${m.tenantId}
      `;

      // Delete published typebots
      await prisma.publicTypebot.deleteMany({
        where: { typebot: { workspaceId: m.workspaceId } },
      });

      // Delete results + answers
      const typebots = await prisma.typebot.findMany({
        where: { workspaceId: m.workspaceId },
        select: { id: true },
      });
      for (const t of typebots) {
        await prisma.answer.deleteMany({ where: { result: { typebotId: t.id } } });
        await prisma.answerV2.deleteMany({ where: { result: { typebotId: t.id } } });
        await prisma.result.deleteMany({ where: { typebotId: t.id } });
      }

      // Delete typebots
      await prisma.typebot.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete folders
      await prisma.dashboardFolder.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete invitations
      await prisma.workspaceInvitation.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete members
      await prisma.memberInWorkspace.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete workspace
      await prisma.workspace.deleteMany({ where: { id: m.workspaceId } });

      // Delete mapping
      await prisma.$executeRaw`
        DELETE FROM "CrmTenantWorkspaceMapping" WHERE "id" = ${m.id}
      `;

      deleted.push(m.tenantId);
    }

    return NextResponse.json({
      ok: true,
      deleted,
      count: deleted.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

