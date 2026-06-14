import redis from "@typebot.io/lib/redis";
import type { BotReplyResult } from "./types";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

type BeginResult =
  | { status: "started" }
  | { status: "duplicate"; cached?: BotReplyResult };

export class BotReplyIdempotencyStore {
  async begin(inboundMessageId: string): Promise<BeginResult> {
    this.assertRedis();

    const responseKey = this.responseKey(inboundMessageId);
    const cached = await redis!.get(responseKey);
    if (cached) {
      return { status: "duplicate", cached: JSON.parse(cached) };
    }

    const acquired = await redis!.set(
      this.processingKey(inboundMessageId),
      "processing",
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );

    if (acquired === "OK") return { status: "started" };

    const cachedAfterRace = await redis!.get(responseKey);
    return {
      status: "duplicate",
      cached: cachedAfterRace ? JSON.parse(cachedAfterRace) : undefined,
    };
  }

  async complete(
    inboundMessageId: string,
    response: BotReplyResult,
  ): Promise<void> {
    this.assertRedis();

    await redis!
      .multi()
      .set(
        this.responseKey(inboundMessageId),
        JSON.stringify(response),
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
      )
      .set(
        this.processingKey(inboundMessageId),
        "done",
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
      )
      .exec();
  }

  async fail(inboundMessageId: string): Promise<void> {
    this.assertRedis();
    await redis!.del(this.processingKey(inboundMessageId));
  }

  private processingKey(inboundMessageId: string): string {
    return `idempotency:bot_reply:${inboundMessageId}`;
  }

  private responseKey(inboundMessageId: string): string {
    return `${this.processingKey(inboundMessageId)}:response`;
  }

  private assertRedis(): void {
    if (!redis) {
      throw new Error("REDIS_URL is required for bot reply idempotency");
    }
  }
}
