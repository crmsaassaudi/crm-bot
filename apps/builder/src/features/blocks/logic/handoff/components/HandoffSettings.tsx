import {
  HandoffTarget,
} from "@typebot.io/blocks-logic/handoff/constants";
import type { HandoffBlockOptions } from "@typebot.io/blocks-logic/handoff/schema";
import { Label } from "@typebot.io/ui/components/Label";
import { useCallback, useEffect, useState } from "react";

type Props = {
  options?: HandoffBlockOptions;
  onOptionsChange: (options: HandoffBlockOptions) => void;
};

type CrmEntity = { id: string; name: string };

const targetOptions = [
  { value: HandoffTarget.GENERAL, label: "🔄 General (auto-assign)" },
  { value: HandoffTarget.GROUP, label: "👥 Specific Group" },
  { value: HandoffTarget.AGENT, label: "👤 Specific Agent" },
];

export const HandoffSettings = ({ options, onOptionsChange }: Props) => {
  const target = options?.target ?? HandoffTarget.GENERAL;
  const [groups, setGroups] = useState<CrmEntity[]>([]);
  const [agents, setAgents] = useState<CrmEntity[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch groups/agents from CRM internal API
  useEffect(() => {
    if (target !== HandoffTarget.GROUP && target !== HandoffTarget.AGENT) return;

    const fetchEntities = async () => {
      setLoading(true);
      try {
        const endpoint =
          target === HandoffTarget.GROUP
            ? "/api/internal/crm/groups"
            : "/api/internal/crm/agents";
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (target === HandoffTarget.GROUP) {
            setGroups(data.groups ?? []);
          } else {
            setAgents(data.agents ?? []);
          }
        }
      } catch (err) {
        console.error("Failed to fetch CRM entities:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [target]);

  const handleTargetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onOptionsChange({
        ...options,
        target: e.target.value as HandoffTarget,
        // Reset selections when switching mode
        groupId: undefined,
        groupName: undefined,
        agentId: undefined,
        agentName: undefined,
      });
    },
    [options, onOptionsChange],
  );

  const handleGroupChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = groups.find((g) => g.id === e.target.value);
      onOptionsChange({
        ...options,
        target: HandoffTarget.GROUP,
        groupId: selected?.id,
        groupName: selected?.name,
      });
    },
    [options, onOptionsChange, groups],
  );

  const handleAgentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = agents.find((a) => a.id === e.target.value);
      onOptionsChange({
        ...options,
        target: HandoffTarget.AGENT,
        agentId: selected?.id,
        agentName: selected?.name,
      });
    },
    [options, onOptionsChange, agents],
  );

  const handleMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onOptionsChange({
        ...options,
        target,
        message: e.target.value || undefined,
      });
    },
    [options, onOptionsChange, target],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Handoff Target</Label>
        <select
          value={target}
          onChange={handleTargetChange}
          className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
        >
          {targetOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {target === HandoffTarget.GROUP && (
        <div className="flex flex-col gap-2">
          <Label>Select Group</Label>
          {loading ? (
            <p className="text-sm text-gray-9">Loading groups...</p>
          ) : groups.length > 0 ? (
            <select
              value={options?.groupId ?? ""}
              onChange={handleGroupChange}
              className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
            >
              <option value="">-- Select a group --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-9">
              No groups available. Configure groups in CRM settings.
            </p>
          )}
        </div>
      )}

      {target === HandoffTarget.AGENT && (
        <div className="flex flex-col gap-2">
          <Label>Select Agent</Label>
          {loading ? (
            <p className="text-sm text-gray-9">Loading agents...</p>
          ) : agents.length > 0 ? (
            <select
              value={options?.agentId ?? ""}
              onChange={handleAgentChange}
              className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
            >
              <option value="">-- Select an agent --</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-9">
              No agents available. Ensure agents are online in CRM.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Custom transition message (optional)</Label>
        <textarea
          placeholder="e.g. Connecting you to a live agent..."
          value={options?.message ?? ""}
          onChange={handleMessageChange}
          rows={2}
          className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm resize-none"
        />
      </div>
    </div>
  );
};
