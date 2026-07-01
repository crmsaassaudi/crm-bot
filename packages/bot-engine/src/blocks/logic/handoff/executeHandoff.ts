import type { HandoffBlock } from "@typebot.io/blocks-logic/handoff/schema";
import { HandoffTarget } from "@typebot.io/blocks-logic/handoff/constants";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import type { ExecuteLogicResponse } from "../../../types";

/**
 * Prefix used by TypebotAdapter to detect handoff signals.
 * MUST stay in sync with extractHandoffMeta() in typebotAdapter.ts.
 */
export const HANDOFF_LOG_PREFIX = "Handoff block executed";

/**
 * Executes the Handoff logic block.
 *
 * Emits structured log metadata so the TypebotAdapter can detect the
 * handoff signal and forward it to CRM-API via callback.
 */
export const executeHandoff = (
  block: HandoffBlock,
  _context: { state: SessionState; sessionStore: SessionStore },
): ExecuteLogicResponse => {
  const options = block.options ?? { target: HandoffTarget.GENERAL };
  const target = options.target ?? HandoffTarget.GENERAL;

  const handoffMeta = {
    target,
    groupId: options.groupId,
    agentId: options.agentId,
    message: options.message,
  };

  // Direct console.log for debugging — will appear in Docker logs
  console.log(`[HANDOFF-EXEC] executeHandoff called! target=${target}, blockId=${block.id}, meta=${JSON.stringify(handoffMeta)}`);

  const logs = [
    {
      status: "info" as const,
      description: `${HANDOFF_LOG_PREFIX} — target: ${target}`,
      details: JSON.stringify(handoffMeta),
    },
  ];

  console.log(`[HANDOFF-EXEC] returning logs: ${JSON.stringify(logs)}`);

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    logs,
  };
};
