import { z } from "zod";

export const botReplyRequestSchema = z.object({
  org: z.string().min(1),
  conversationId: z.string().min(1),
  inboundMessageId: z.string().min(1),
  text: z.string().min(1),
  channel: z.string().min(1),
  sessionId: z.string().min(1).nullish(),
});

export type BotReplyRequest = z.infer<typeof botReplyRequestSchema>;

export type BotReplyButton = {
  id?: string;
  label: string;
  value?: string;
};

export type BotReplyMessage = {
  type: "text";
  text: string;
  buttons?: BotReplyButton[];
  raw?: unknown;
};

export type BotReplyResponse = {
  ok: true;
  duplicate?: boolean;
  sessionId?: string;
  status: "active" | "handoff" | "ended";
  handoff: boolean;
  messages: BotReplyMessage[];
};
