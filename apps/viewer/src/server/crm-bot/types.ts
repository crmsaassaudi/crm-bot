import { z } from "zod";

export type HandoffMeta = {
  target: "general" | "group" | "agent";
  groupId?: string;
  agentId?: string;
  message?: string;
};

export const botReplyRequestSchema = z.object({
  org: z.string().min(1),
  conversationId: z.string().min(1),
  inboundMessageId: z.string().min(1),
  text: z.string(),
  channel: z.string().min(1),
  /** CRM Channel document _id — used to resolve which flow to run */
  channelId: z.string().min(1).optional(),
  sessionId: z.string().min(1).nullish(),
  /** Button reply ID — Typebot item.id for exact branch matching */
  replyId: z.string().optional(),
  /** Message type from the channel (text, image, video, etc.) */
  messageType: z.string().optional(),
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
  type: "text" | "image" | "video" | "audio" | "file";
  /** Text content (for type=text) or caption (for media types) */
  text?: string;
  /** Media URL (for image/video/audio/file types) */
  url?: string;
  /** MIME type of the media (e.g., "image/png", "video/mp4") */
  mimeType?: string;
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
  handoffMeta?: HandoffMeta;
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
  handoffMeta?: HandoffMeta;
};
