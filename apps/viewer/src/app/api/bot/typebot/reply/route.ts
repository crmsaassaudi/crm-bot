import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { BotService } from "../../../../../server/crm-bot/botService";
import { checkBotRateLimit } from "../../../../../server/crm-bot/botRateLimiter";
import { withConcurrencyLimit } from "../../../../../server/crm-bot/concurrencyLimiter";
import { botLogger } from "../../../../../server/crm-bot/logger";
import { botReplyRequestSchema } from "../../../../../server/crm-bot/types";

export const runtime = "nodejs";

const botService = new BotService();

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedInternalRequest(request)) {
      return NextResponse.json(
        { accepted: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = botReplyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          accepted: false,
          error: "Invalid bot reply payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    // Rate limit per tenant
    const rateLimit = await checkBotRateLimit(parsed.data.org);
    if (!rateLimit.allowed) {
      botLogger.warn("Rate limit exceeded", {
        tenantId: parsed.data.org,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return NextResponse.json(
        { accepted: false, error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    // Accept immediately — return 200 fast
    const acceptResult = await botService.accept(parsed.data);

    if (acceptResult.duplicate) {
      return NextResponse.json(
        { accepted: true, duplicate: true },
        { status: 200 },
      );
    }

    // Fire-and-forget: process flow + callback in background
    // Wrapped in concurrency limiter to prevent DB/Redis overload under
    // campaign traffic. Do NOT await — let the response return immediately.
    withConcurrencyLimit(() => botService.processAndCallback(parsed.data)).catch(
      (error) => {
        if (
          error instanceof Error &&
          error.message === "Bot processing queue full"
        ) {
          // Queue saturated — crm-api should retry later
          botLogger.warn("Rejected: concurrency queue full", {
            tenantId: parsed.data.org,
            messageId: parsed.data.inboundMessageId,
          });
        } else {
          botLogger.error("Background processing failed", {
            tenantId: parsed.data.org,
            messageId: parsed.data.inboundMessageId,
            conversationId: parsed.data.conversationId,
          }, error);
        }
      },
    );

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { accepted: false, error: message },
      { status: 500 },
    );
  }
}

const isAuthorizedInternalRequest = (request: NextRequest) => {
  const secret = process.env.CRM_BOT_INTERNAL_SECRET;
  if (!secret) return false;

  const providedSecret = request.headers.get("x-crm-internal-secret");
  if (!providedSecret) return false;

  const expected = Buffer.from(secret);
  const actual = Buffer.from(providedSecret);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
