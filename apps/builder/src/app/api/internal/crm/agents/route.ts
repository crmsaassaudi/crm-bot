import { isAuthorizedCrmInternalRequest } from "@typebot.io/auth/helpers/isAuthorizedCrmInternalRequest";
import { env } from "@typebot.io/env";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/internal/crm/agents
 *
 * Proxies to CRM-API to fetch available agents for the Handoff block
 * agent selector. The CRM tenantId is passed via query param.
 *
 * Authentication: x-crm-internal-secret header (shared secret)
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCrmInternalRequest(request))
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");

    if (!tenantId)
      return NextResponse.json(
        { ok: false, error: "tenantId query parameter is required" },
        { status: 400 },
      );

    const crmApiUrl = env.CRM_API_INTERNAL_URL ?? process.env.CRM_API_INTERNAL_URL;
    if (!crmApiUrl)
      return NextResponse.json(
        { ok: false, error: "CRM_API_INTERNAL_URL not configured" },
        { status: 500 },
      );

    const crmSecret = env.CRM_BOT_INTERNAL_SECRET ?? process.env.CRM_BOT_INTERNAL_SECRET;

    // Fetch agents/users from CRM API
    const res = await fetch(`${crmApiUrl}/v1/users?limit=100&role=agent`, {
      headers: {
        "x-tenant-id": tenantId,
        ...(crmSecret ? { "x-crm-internal-secret": crmSecret } : {}),
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `CRM API returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Normalize CRM response to simple { id, name } list
    const agents = (data.data ?? data.users ?? data ?? []).map(
      (u: { _id?: string; id?: string; firstName?: string; lastName?: string; name?: string; email?: string }) => ({
        id: u._id ?? u.id,
        name: u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown"),
      }),
    );

    return NextResponse.json({ ok: true, agents }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
