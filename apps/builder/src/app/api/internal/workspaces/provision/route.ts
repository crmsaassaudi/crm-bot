import { isAuthorizedCrmInternalRequest } from "@typebot.io/auth/helpers/isAuthorizedCrmInternalRequest";
import { provisionCrmTenantWorkspace } from "@typebot.io/workspaces/crmTenantWorkspaceMapping";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const provisionWorkspaceSchema = z.object({
  tenantId: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1),
  tenantName: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedCrmInternalRequest(request))
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const body = await request.json();
    const parsed = provisionWorkspaceSchema.safeParse(body);

    if (!parsed.success)
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid workspace provisioning payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );

    const mapping = await provisionCrmTenantWorkspace(parsed.data);

    return NextResponse.json(
      { ok: true, workspaceId: mapping.workspaceId },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

