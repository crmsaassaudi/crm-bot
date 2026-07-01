import { Icon } from "@typebot.io/ui/components/Icon";

export const HandoffIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    {/* Person silhouette */}
    <circle cx="9" cy="7" r="3" />
    <path d="M9 13c-4 0-6 2-6 4v1h12v-1c0-2-2-4-6-4z" />
    {/* Arrow pointing right to agent */}
    <path d="M16 11l4 0" />
    <path d="M18 9l2 2-2 2" />
    {/* Agent headset */}
    <path d="M19 4a3 3 0 0 1 3 3v1" />
    <circle cx="22" cy="9" r="1" />
  </Icon>
);
