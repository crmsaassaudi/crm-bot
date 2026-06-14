import { resolveFlowForTenant } from "./flowResolver";
import { BotReplyIdempotencyStore } from "./idempotencyStore";
import { assertFlowBelongsToTenant } from "./tenantGuard";
import { TypebotAdapter } from "./typebotAdapter";
import type {
  BotReplyRequest,
  BotAcceptResponse,
  BotCallbackPayload,
  BotReplyResult,
} from "./types";

export class BotService {
  constructor(
    private readonly idempotencyStore = new BotReplyIdempotencyStore(),
    private readonly typebotAdapter = new TypebotAdapter(),
  ) {}

  /**
   * Accept the request immediately (return fast).
   * Returns { accepted: true } or { accepted: true, duplicate: true }.
   */
  async accept(input: BotReplyRequest): Promise<BotAcceptResponse> {
    const begin = await this.idempotencyStore.begin(input.inboundMessageId);
    if (begin.status === "duplicate") {
      return { accepted: true, duplicate: true };
    }
    return { accepted: true };
  }

  /**
   * Process the bot flow asynchronously, then POST results to callbackUrl.
   * Called after accept() returns — runs in background.
   */
  async processAndCallback(input: BotReplyRequest): Promise<void> {
    try {
      const result = await this.processFlow(input);

      // Send result to crm-api via callback
      const callbackPayload: BotCallbackPayload = {
        org: input.org,
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        sessionId: result.sessionId,
        status: result.status,
        handoff: result.handoff,
        messages: result.messages,
      };

      await this.sendCallback(input.callbackUrl, callbackPayload);
      await this.idempotencyStore.complete(input.inboundMessageId, result);
    } catch (error) {
      await this.idempotencyStore.fail(input.inboundMessageId);

      // On error, still try to callback with error info
      try {
        const errorPayload: BotCallbackPayload = {
          org: input.org,
          conversationId: input.conversationId,
          inboundMessageId: input.inboundMessageId,
          status: "ended",
          handoff: false,
          messages: [],
        };
        await this.sendCallback(input.callbackUrl, errorPayload);
      } catch {
        // Callback itself failed — nothing more we can do
        console.error(
          `[BotService] Failed to send error callback for ${input.inboundMessageId}`,
          error,
        );
      }
    }
  }

  private async processFlow(input: BotReplyRequest): Promise<BotReplyResult> {
    let resolvedFlowId: string | undefined;

    if (!input.sessionId) {
      const flow = await resolveFlowForTenant(input.org, input.channelId);
      if (!flow) {
        // No flow bound to this channel → SKIP (let agent handle)
        return {
          ok: true,
          sessionId: undefined,
          status: "ended",
          handoff: false,
          messages: [],
        };
      }

      await assertFlowBelongsToTenant(flow.publicId, input.org);
      resolvedFlowId = flow.publicId;
    }

    const adapterInput = {
      ...input,
      flowId: resolvedFlowId ?? "",
    };

    return await this.typebotAdapter.reply(adapterInput);
  }

  private async sendCallback(
    callbackUrl: string,
    payload: BotCallbackPayload,
  ): Promise<void> {
    const secret = process.env.CRM_BOT_INTERNAL_SECRET;

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-crm-internal-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Callback failed: ${response.status} ${response.statusText}`,
      );
    }
  }
}
