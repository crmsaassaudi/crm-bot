import { z } from "zod";

export const botReplyRequestSchema = z.object({
  org: z.string().min(1),
  conversationId: z.string().min(1),
  inboundMessageId: z.string().min(1),
  text: z.string().min(1),
  channel: z.string().min(1),
  sessionId: z.string().min(1).nullish(),
  /** CRM-API callback URL — bot will POST results here after processing */
  callbackUrl: z.string().url(),
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

/** Immediate response — bot accepted the request */
export type BotAcceptResponse = {
  accepted: true;
  duplicate?: boolean;
};

/** Full bot result (used internally + sent via callback) */
export type BotReplyResult = {
  ok: true;
  duplicate?: boolean;
  sessionId?: string;
  status: "active" | "handoff" | "ended";
  handoff: boolean;
  messages: BotReplyMessage[];
};

/** Callback payload sent from bot to crm-api */
export type BotCallbackPayload = {
  org: string;
  conversationId: string;
  inboundMessageId: string;
  sessionId?: string;
  status: "active" | "handoff" | "ended";
  handoff: boolean;
  messages: BotReplyMessage[];
};
