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
          ok: false,
          error: "Invalid bot reply payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const response = await botService.reply(parsed.data);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
