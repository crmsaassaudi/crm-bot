import { timingSafeEqual } from "node:crypto";
import { env } from "@typebot.io/env";
import type { NextRequest } from "next/server";

/**
 * Validates that an incoming request carries the correct CRM internal secret
 * in the `x-crm-internal-secret` header, using timing-safe comparison.
 *
 * Used to authenticate internal API calls between crm-api ↔ crm-bot services.
 *
 * @returns true if the request is authenticated, false otherwise
 */
export const isAuthorizedCrmInternalRequest = (
  request: NextRequest,
): boolean => {
  if (!env.CRM_BOT_INTERNAL_SECRET) return false;

  const providedSecret = request.headers.get("x-crm-internal-secret");
  if (!providedSecret) return false;

  const expected = Buffer.from(env.CRM_BOT_INTERNAL_SECRET);
  const actual = Buffer.from(providedSecret);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
