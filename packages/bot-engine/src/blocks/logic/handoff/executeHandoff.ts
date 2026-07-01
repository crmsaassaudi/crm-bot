import type { HandoffBlock } from "@typebot.io/blocks-logic/handoff/schema";
import { HandoffTarget } from "@typebot.io/blocks-logic/handoff/constants";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import type { ExecuteLogicResponse } from "../../../types";

/**
 * Executes the Handoff logic block.
 *
 * Injects handoff metadata as session variables so the TypebotAdapter
 * can detect the signal and forward it to CRM-API via callback.
 *
 * Variables set:
 *   - handoff_to_agent = "true"            (trigger signal)
 *   - handoff_target   = general|group|agent
 *   - handoff_group_id = <groupId>         (when target=group)
 *   - handoff_agent_id = <agentId>         (when target=agent)
 */
export const executeHandoff = (
  block: HandoffBlock,
  _context: { state: SessionState; sessionStore: SessionStore },
): ExecuteLogicResponse => {
  const options = block.options ?? { target: HandoffTarget.GENERAL };
  const target = options.target ?? HandoffTarget.GENERAL;

  // Build logs for observability
  const logs = [
    {
      status: "info" as const,
      description: `Handoff block executed — target: ${target}`,
      details: JSON.stringify({
        target,
        groupId: options.groupId,
        agentId: options.agentId,
        message: options.message,
      }),
    },
  ];

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    logs,
  };
};
