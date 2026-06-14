import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { env } from "@typebot.io/env";
import { orpc } from "@/lib/queryClient";
import { toast } from "@/lib/toast";

const channelTypeIcons: Record<string, string> = {
  facebook: "💬",
  whatsapp: "📱",
  instagram: "📸",
  telegram: "✈️",
  web: "🌐",
  email: "📧",
  sms: "📩",
};

const channelStatusColors: Record<string, string> = {
  Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Error: "bg-red-500/20 text-red-400 border-red-500/30",
  Inactive: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export const CrmChannelBindings = ({
  typebotId,
}: {
  typebotId: string;
}) => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
  } = useQuery(
    orpc.crmChannels.listCrmChannels.queryOptions({
      input: { typebotId },
    }),
  );

  const { mutateAsync: updateBindings, isPending } = useMutation(
    orpc.crmChannels.updateChannelBindings.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.crmChannels.listCrmChannels.key({ input: { typebotId } }),
        });
      },
      onError: (error) => {
        toast({
          title: "Failed to update channel binding",
          description: error.message,
        });
      },
    }),
  );

  if (!env.NEXT_PUBLIC_CRM_BOT_SSO_LOCKDOWN) return null;

  const channels = data?.channels ?? [];

  const handleToggle = async (channelId: string, currentlyBound: boolean) => {
    const currentBoundIds = channels
      .filter((ch) => ch.isBound)
      .map((ch) => ch.id);

    const newChannelIds = currentlyBound
      ? currentBoundIds.filter((id) => id !== channelId)
      : [...currentBoundIds, channelId];

    await updateBindings({ typebotId, channelIds: newChannelIds });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400" />
          <span className="text-sm text-zinc-400">
            Loading CRM channels...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-red-400">
          Failed to load channels. Please try again.
        </p>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-2xl">📡</span>
          <p className="text-sm text-zinc-400">
            No channels configured yet. Set up channels in your CRM dashboard
            first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-gray-1 divide-y divide-zinc-700/50">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-zinc-800/30"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {channelTypeIcons[channel.type] ?? "📡"}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {channel.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-500 capitalize">
                  {channel.type}
                </span>
                {channel.status && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                      channelStatusColors[channel.status] ??
                      channelStatusColors.Inactive
                    }`}
                  >
                    {channel.status}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={channel.isBound}
            disabled={isPending}
            onClick={() => handleToggle(channel.id, channel.isBound)}
            className={`
              relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
              border-2 border-transparent transition-colors duration-200 ease-in-out
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
              disabled:cursor-not-allowed disabled:opacity-50
              ${channel.isBound ? "bg-blue-600" : "bg-zinc-600"}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 rounded-full bg-white
                shadow-lg ring-0 transition-transform duration-200 ease-in-out
                ${channel.isBound ? "translate-x-5" : "translate-x-0"}
              `}
            />
          </button>
        </div>
      ))}
    </div>
  );
};
