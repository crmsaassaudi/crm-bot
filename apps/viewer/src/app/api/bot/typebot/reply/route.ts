import { NextResponse, type NextRequest } from "next/server";
import { BotService } from "../../../../../server/crm-bot/botService";
import { botReplyRequestSchema } from "../../../../../server/crm-bot/types";

export const runtime = "nodejs";

const botService = new BotService();

export async function POST(request: NextRequest) {
  try {
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

    // Accept immediately — return 200 fast
    const acceptResult = await botService.accept(parsed.data);

    if (acceptResult.duplicate) {
      return NextResponse.json(
        { accepted: true, duplicate: true },
        { status: 200 },
      );
    }

    // Fire-and-forget: process flow + callback in background
    // Do NOT await — let the response return immediately
    botService.processAndCallback(parsed.data).catch((error) => {
      console.error(
        `[bot/reply] Background processing failed for ${parsed.data.inboundMessageId}:`,
        error instanceof Error ? error.message : error,
      );
    });

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { accepted: false, error: message },
      { status: 500 },
    );
  }
}
