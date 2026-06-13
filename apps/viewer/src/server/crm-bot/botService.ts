import { resolveFlowForTenant } from "./flowResolver";
import { BotReplyIdempotencyStore } from "./idempotencyStore";
import {
  TenantGuardError,
  assertFlowBelongsToTenant,
} from "./tenantGuard";
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
      // For new conversations (no sessionId), resolve the flow for this tenant.
      // Bot decides which flow to run — CRM only sends ON/OFF.
      let resolvedFlowId: string | undefined;

      if (!input.sessionId) {
        const flow = await resolveFlowForTenant(input.org);
        if (!flow) {
          return {
            ok: true,
            sessionId: undefined,
            status: "ended",
            handoff: false,
            messages: [
              {
                type: "text",
                text: "Bot chưa được cấu hình cho tổ chức này.",
              },
            ],
          };
        }

        // Validate the resolved flow belongs to this tenant (defense-in-depth)
        await assertFlowBelongsToTenant(flow.publicId, input.org);
        resolvedFlowId = flow.publicId;
      }

      // Pass the resolved flowId to the adapter
      const adapterInput = {
        ...input,
        flowId: resolvedFlowId ?? "",
      };

      const response = await this.typebotAdapter.reply(adapterInput);
      await this.idempotencyStore.complete(input.inboundMessageId, response);
      return response;
    } catch (error) {
      await this.idempotencyStore.fail(input.inboundMessageId);

      // Return a structured error for tenant guard violations
      if (error instanceof TenantGuardError) {
        return {
          ok: true,
          sessionId: undefined,
          status: "ended",
          handoff: false,
          messages: [],
          _error: {
            code: error.code,
            message: error.message,
          },
        } as BotReplyResponse;
      }

      throw error;
    }
  }
}
