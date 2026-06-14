import redis from "@typebot.io/lib/redis";
import type { BotReplyResult } from "./types";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

type BeginResult =
  | { status: "started" }
  | { status: "duplicate"; cached?: BotReplyResult };

export class BotReplyIdempotencyStore {
  /**
   * Begin idempotency check for a bot reply request.
   * Keys are scoped by tenant (org) to prevent cross-tenant collisions.
   */
  async begin(org: string, inboundMessageId: string): Promise<BeginResult> {
    this.assertRedis();

    const responseKey = this.responseKey(org, inboundMessageId);
    const cached = await redis!.get(responseKey);
    if (cached) {
      return { status: "duplicate", cached: JSON.parse(cached) };
    }

    const acquired = await redis!.set(
      this.processingKey(org, inboundMessageId),
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
    org: string,
    inboundMessageId: string,
    response: BotReplyResult,
  ): Promise<void> {
    this.assertRedis();

    await redis!
      .multi()
      .set(
        this.responseKey(org, inboundMessageId),
        JSON.stringify(response),
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
      )
      .set(
        this.processingKey(org, inboundMessageId),
        "done",
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
      )
      .exec();
  }

  async fail(org: string, inboundMessageId: string): Promise<void> {
    this.assertRedis();
    await redis!.del(this.processingKey(org, inboundMessageId));
  }

  /**
   * Redis key for tracking processing state.
   * Scoped by org (tenantId) to ensure tenant isolation — prevents
   * cross-tenant collisions if two tenants happen to share a messageId.
   */
  private processingKey(org: string, inboundMessageId: string): string {
    return `crm-bot:idempotency:${org}:${inboundMessageId}`;
  }

  private responseKey(org: string, inboundMessageId: string): string {
    return `${this.processingKey(org, inboundMessageId)}:response`;
  }

  private assertRedis(): void {
    if (!redis) {
      throw new Error("REDIS_URL is required for bot reply idempotency");
    }
  }
}
