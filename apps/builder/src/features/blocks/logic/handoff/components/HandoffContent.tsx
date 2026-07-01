import type { HandoffBlock } from "@typebot.io/blocks-logic/handoff/schema";
import { HandoffTarget } from "@typebot.io/blocks-logic/handoff/constants";

const targetLabels: Record<string, string> = {
  [HandoffTarget.GENERAL]: "General handoff",
  [HandoffTarget.GROUP]: "Handoff → Group",
  [HandoffTarget.AGENT]: "Handoff → Agent",
};

export const HandoffContent = ({ block }: { block: HandoffBlock }) => {
  const target = block.options?.target ?? HandoffTarget.GENERAL;
  const label = targetLabels[target] ?? "Handoff";

  let detail = "";
  if (target === HandoffTarget.GROUP && block.options?.groupName) {
    detail = `: ${block.options.groupName}`;
  } else if (target === HandoffTarget.AGENT && block.options?.agentName) {
    detail = `: ${block.options.agentName}`;
  }

  return (
    <p className="text-sm text-gray-11">
      {label}
      {detail}
    </p>
  );
};
