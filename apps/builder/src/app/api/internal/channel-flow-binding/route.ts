import { timingSafeEqual } from "node:crypto";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

// ── Schemas ──────────────────────────────────────────────────────────

const upsertBindingsSchema = z.object({
  tenantId: z.string().min(1),
  typebotId: z.string().min(1),
  channelIds: z.array(z.string().min(1)),
});

// ── GET: List bindings for a tenant or a specific flow ───────────────

export async function GET(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  const typebotId = searchParams.get("typebotId");

  if (!tenantId)
    return NextResponse.json({ ok: false, error: "tenantId required" }, { status: 400 });

  const where: Record<string, string> = { tenantId };
  if (typebotId) where.typebotId = typebotId;

  const bindings = await prisma.crmChannelFlowBinding.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      channelId: true,
      typebotId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ ok: true, bindings });
}

// ── PUT: Replace all channel bindings for a specific flow ────────────

export async function PUT(request: NextRequest) {
  try {
    if (!isAuthorizedInternalRequest(request))
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = upsertBindingsSchema.safeParse(body);

    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );

    const { tenantId, typebotId, channelIds } = parsed.data;

    // Verify typebot exists and belongs to tenant's workspace
    const typebot = await prisma.typebot.findFirst({
      where: { id: typebotId },
      select: { id: true, workspace: { select: { crmTenantMapping: { select: { tenantId: true } } } } },
    });

    if (!typebot)
      return NextResponse.json({ ok: false, error: "Typebot not found" }, { status: 404 });

    if (typebot.workspace.crmTenantMapping?.tenantId !== tenantId)
      return NextResponse.json({ ok: false, error: "Typebot does not belong to tenant" }, { status: 403 });

    // Transaction: delete old bindings for this flow, create new ones
    await prisma.$transaction(async (tx) => {
      // Remove existing bindings for this flow
      await tx.crmChannelFlowBinding.deleteMany({
        where: { tenantId, typebotId },
      });

      // Remove any bindings where these channels are bound to OTHER flows
      // (1 channel = 1 flow constraint)
      if (channelIds.length > 0) {
        await tx.crmChannelFlowBinding.deleteMany({
          where: { tenantId, channelId: { in: channelIds } },
        });

        // Create new bindings
        await tx.crmChannelFlowBinding.createMany({
          data: channelIds.map((channelId) => ({
            tenantId,
            channelId,
            typebotId,
          })),
        });
      }
    });

    return NextResponse.json({ ok: true, channelIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── DELETE: Remove a specific binding ────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    if (!isAuthorizedInternalRequest(request))
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const channelId = searchParams.get("channelId");

    if (!tenantId || !channelId)
      return NextResponse.json(
        { ok: false, error: "tenantId and channelId required" },
        { status: 400 },
      );

    await prisma.crmChannelFlowBinding.deleteMany({
      where: { tenantId, channelId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── Auth helper ──────────────────────────────────────────────────────

const isAuthorizedInternalRequest = (request: NextRequest) => {
  if (!env.CRM_BOT_INTERNAL_SECRET) return false;

  const providedSecret = request.headers.get("x-crm-internal-secret");
  if (!providedSecret) return false;

  const expected = Buffer.from(env.CRM_BOT_INTERNAL_SECRET);
  const actual = Buffer.from(providedSecret);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
