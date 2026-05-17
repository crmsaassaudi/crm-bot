import { BotReplyIdempotencyStore } from "./idempotencyStore";
import { TypebotAdapter } from "./typebotAdapter";
import type { BotReplyRequest, BotReplyResponse } from "./types";

export class BotService {
  constructor(
    private readonly idempotencyStore = new BotReplyIdempotencyStore(),
    private readonly typebotAdapter = new TypebotAdapter(),
  ) {}

  async reply(input: BotReplyRequest): Promise<BotReplyResponse> {
    const begin = await this.idempotencyStore.begin(input.inboundMessageId);
    if (begin.status === "duplicate") {
      return (
        (begin.cached ? { ...begin.cached, duplicate: true } : undefined) ?? {
          ok: true,
          duplicate: true,
          sessionId: input.sessionId ?? undefined,
          status: "active",
          handoff: false,
          messages: [],
        }
      );
    }

    try {
      const response = await this.typebotAdapter.reply(input);
      await this.idempotencyStore.complete(input.inboundMessageId, response);
      return response;
    } catch (error) {
      await this.idempotencyStore.fail(input.inboundMessageId);
      throw error;
    }
  }
}
