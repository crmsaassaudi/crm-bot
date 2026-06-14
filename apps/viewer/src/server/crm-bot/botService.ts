import { resolveFlowForTenant } from "./flowResolver";
import { BotReplyIdempotencyStore } from "./idempotencyStore";
import { botLogger } from "./logger";
import { assertFlowBelongsToTenant } from "./tenantGuard";
import { TypebotAdapter } from "./typebotAdapter";
import type {
  BotReplyRequest,
  BotAcceptResponse,
  BotCallbackPayload,
  BotReplyResult,
} from "./types";

/** Maximum time (ms) for the entire processFlow() call before aborting. */
const PROCESSING_TIMEOUT_MS = 30_000;

/** Maximum time (ms) for each callback HTTP request. */
const CALLBACK_TIMEOUT_MS = 10_000;

/** Number of retry attempts for the callback POST. */
const CALLBACK_MAX_RETRIES = 2;

/** Base delay (ms) for exponential backoff between callback retries. */
const CALLBACK_RETRY_BASE_MS = 1_000;

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
    const begin = await this.idempotencyStore.begin(
      input.org,
      input.inboundMessageId,
    );
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
      assertCallbackUrlAllowed(input.callbackUrl);

      const result = await this.processFlowWithTimeout(input);

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

      await this.sendCallbackWithRetry(input.callbackUrl, callbackPayload);
      await this.idempotencyStore.complete(
        input.org,
        input.inboundMessageId,
        result,
      );
    } catch (error) {
      await this.idempotencyStore.fail(input.org, input.inboundMessageId);

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
        await this.sendCallbackWithRetry(input.callbackUrl, errorPayload);
      } catch (callbackError) {
        // Callback itself failed — nothing more we can do
        botLogger.error("Failed to send error callback", {
          tenantId: input.org,
          messageId: input.inboundMessageId,
          conversationId: input.conversationId,
        }, callbackError);
      }
    }
  }

  /**
   * Wraps processFlow() with an AbortController timeout to prevent
   * runaway bot engine executions from hanging indefinitely.
   */
  private async processFlowWithTimeout(
    input: BotReplyRequest,
  ): Promise<BotReplyResult> {
    return Promise.race([
      this.processFlow(input),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Bot processing timed out after ${PROCESSING_TIMEOUT_MS}ms`,
              ),
            ),
          PROCESSING_TIMEOUT_MS,
        );
      }),
    ]);
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

  /**
   * Sends callback with retry and exponential backoff.
   * Retries up to CALLBACK_MAX_RETRIES times on failure.
   */
  private async sendCallbackWithRetry(
    callbackUrl: string,
    payload: BotCallbackPayload,
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= CALLBACK_MAX_RETRIES; attempt++) {
      try {
        await this.sendCallback(callbackUrl, payload);
        return; // success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < CALLBACK_MAX_RETRIES) {
          const delay = CALLBACK_RETRY_BASE_MS * 2 ** attempt;
          botLogger.warn("Callback attempt failed, retrying", {
            tenantId: payload.org,
            messageId: payload.inboundMessageId,
            attempt: attempt + 1,
            maxAttempts: CALLBACK_MAX_RETRIES + 1,
            retryDelayMs: delay,
          }, lastError);
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Callback failed after all retries");
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
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Callback failed: ${response.status} ${response.statusText}`,
      );
    }
  }
}

/**
 * Validates that callbackUrl points to the trusted CRM API origin.
 * Prevents SSRF — an attacker cannot redirect bot results to arbitrary URLs.
 *
 * @throws Error if callbackUrl origin doesn't match CRM_API_INTERNAL_URL
 */
const assertCallbackUrlAllowed = (callbackUrl: string): void => {
  const allowedBase = process.env.CRM_API_INTERNAL_URL;

  // If CRM_API_INTERNAL_URL is not configured, allow any URL (dev mode)
  if (!allowedBase) return;

  try {
    const callbackOrigin = new URL(callbackUrl).origin;
    const allowedOrigin = new URL(allowedBase).origin;

    if (callbackOrigin !== allowedOrigin) {
      throw new Error(
        `Callback URL origin "${callbackOrigin}" is not in the allowed list. Expected: "${allowedOrigin}"`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("not in the allowed"))
      throw error;
    throw new Error(`Invalid callback URL: ${callbackUrl}`);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
