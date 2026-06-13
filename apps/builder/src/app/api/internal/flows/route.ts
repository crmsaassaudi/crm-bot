import { timingSafeEqual } from "node:crypto";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { getCrmWorkspaceMappingByTenantId } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * GET /api/internal/flows?tenantId=xxx
 *
 * Returns all published Typebot flows belonging to the given CRM tenant.
 * Used by crm-api to let users select a bot flow for their channel.
 *
 * Authentication: x-crm-internal-secret header (shared secret)
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedInternalRequest(request))
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      tenantId: url.searchParams.get("tenantId"),
    });

    if (!parsed.success)
      return NextResponse.json(
        {
          ok: false,
          error: "tenantId query parameter is required",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );

    const { tenantId } = parsed.data;

    // 1. Resolve tenant → workspace mapping
    const mapping = await getCrmWorkspaceMappingByTenantId(tenantId);
    if (!mapping)
      return NextResponse.json(
        {
          ok: false,
          error: `No workspace mapping found for tenant ${tenantId}`,
        },
        { status: 404 },
      );

    // 2. Query all non-archived typebots in this workspace
    const typebots = await prisma.typebot.findMany({
      where: {
        workspaceId: mapping.workspaceId,
        isArchived: false,
      },
      select: {
        id: true,
        publicId: true,
        name: true,
        icon: true,
        updatedAt: true,
        publishedTypebot: {
          select: { id: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // 3. Map to response format
    const flows = typebots.map((t) => ({
      id: t.id,
      publicId: t.publicId,
      name: t.name,
      icon: t.icon,
      updatedAt: t.updatedAt.toISOString(),
      isPublished: Boolean(t.publishedTypebot),
    }));

    return NextResponse.json({ ok: true, flows }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

const isAuthorizedInternalRequest = (request: NextRequest) => {
  if (!env.CRM_BOT_INTERNAL_SECRET) return false;

  const providedSecret = request.headers.get("x-crm-internal-secret");
  if (!providedSecret) return false;

  const expected = Buffer.from(env.CRM_BOT_INTERNAL_SECRET);
  const actual = Buffer.from(providedSecret);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
