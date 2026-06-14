import { handleContinueChat } from "@typebot.io/bot-engine/api/handleContinueChat";
import { handleStartChat } from "@typebot.io/bot-engine/api/handleStartChat";
import type {
  BotReplyResult,
  BotReplyButton,
  BotReplyMessage,
} from "./types";

type TypebotRuntimeResponse = Record<string, any>;

/** Input for TypebotAdapter — includes flowId resolved by BotService */
type TypebotAdapterInput = {
  org: string;
  conversationId: string;
  flowId: string;
  inboundMessageId: string;
  text: string;
  channel: string;
  sessionId?: string | null;
  /** Button reply ID — maps to Typebot item.id for exact choice matching */
  replyId?: string;
};

/** Build the message payload for Typebot engine */
const buildInputMessage = (text: string, replyId?: string) => ({
  type: "text" as const,
  text,
  ...(replyId ? { metadata: { replyId } } : {}),
});

export class TypebotAdapter {
  async reply(input: TypebotAdapterInput): Promise<BotReplyResult> {
    if (input.sessionId) {
      const response = await handleContinueChat({
        input: {
          sessionId: input.sessionId,
          message: buildInputMessage(input.text, input.replyId),
          textBubbleContentFormat: "markdown",
        },
        context: {},
      });

      return normalizeTypebotResponse(response, input.sessionId);
    }

    const response = await handleStartChat({
      input: {
        publicId: input.flowId,
        message: buildInputMessage(input.text, input.replyId),
        isStreamEnabled: false,
        isOnlyRegistering: false,
        prefilledVariables: {
          org: input.org,
          conversationId: input.conversationId,
          channel: input.channel,
          inboundMessageId: input.inboundMessageId,
        },
        textBubbleContentFormat: "markdown",
      },
      context: {},
    });

    return normalizeTypebotResponse(response, response.sessionId);
  }
}

export const normalizeTypebotResponse = (
  response: TypebotRuntimeResponse,
  sessionId?: string,
): BotReplyResult => {
  const messages = (response.messages ?? [])
    .map(normalizeBubble)
    .filter(
      (message: BotReplyMessage | null): message is BotReplyMessage =>
        message !== null,
    );

  const buttons = extractButtons(response.input);
  if (buttons.length > 0 && messages.length > 0) {
    messages[messages.length - 1] = {
      ...messages[messages.length - 1],
      buttons,
    };
  }

  const handoff = containsHandoffSignal(response);
  const ended = !handoff && response.progress === 100 && !response.input;

  return {
    ok: true,
    sessionId,
    messages,
    handoff,
    status: handoff ? "handoff" : ended ? "ended" : "active",
  };
};

/**
 * Normalizes a Typebot bubble into a BotReplyMessage.
 * Supports text, image, video, audio, and file bubble types.
 */
const normalizeBubble = (bubble: any): BotReplyMessage | null => {
  if (!bubble?.type) return null;

  const bubbleType = String(bubble.type).toLowerCase();

  switch (bubbleType) {
    case "text": {
      const text =
        bubble.content?.type === "markdown"
          ? bubble.content.markdown
          : extractTextFromRichText(bubble.content?.richText);

      if (!text?.trim()) return null;

      return {
        type: "text" as const,
        text: text.trim(),
        raw: bubble,
      };
    }

    case "image": {
      const url = bubble.content?.url;
      if (!url) return null;

      return {
        type: "image" as const,
        url,
        text: bubble.content?.clickLink?.alt || undefined,
        mimeType: guessMimeType(url, "image"),
        raw: bubble,
      };
    }

    case "video": {
      const url = bubble.content?.url;
      if (!url) return null;

      return {
        type: "video" as const,
        url,
        mimeType: guessMimeType(url, "video"),
        raw: bubble,
      };
    }

    case "audio": {
      const url = bubble.content?.url;
      if (!url) return null;

      return {
        type: "audio" as const,
        url,
        mimeType: guessMimeType(url, "audio"),
        raw: bubble,
      };
    }

    case "file": {
      const url = bubble.content?.url;
      if (!url) return null;

      return {
        type: "file" as const,
        url,
        text: bubble.content?.name || undefined,
        mimeType: bubble.content?.mimeType || undefined,
        raw: bubble,
      };
    }

    case "embed": {
      // Embeds (iframe URLs etc.) are not directly sendable via CRM channels.
      // Log a warning and skip.
      console.warn(
        `[TypebotAdapter] Skipping unsupported bubble type "embed". URL: ${bubble.content?.url}`,
      );
      return null;
    }

    default: {
      console.warn(
        `[TypebotAdapter] Unknown bubble type "${bubble.type}" — skipping`,
      );
      return null;
    }
  }
};

const extractButtons = (input: any): BotReplyButton[] => {
  if (!input?.type || !String(input.type).toLowerCase().includes("choice")) {
    return [];
  }

  return (input.items ?? [])
    .map((item: any) => {
      const label = item.content ?? item.value ?? item.label;
      if (!label) return null;
      return {
        id: item.id,
        label,
        value: item.value ?? label,
      };
    })
    .filter((button: BotReplyButton | null): button is BotReplyButton =>
      Boolean(button),
    );
};

const extractTextFromRichText = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractTextFromRichText).join("");
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const ownText = typeof record.text === "string" ? record.text : "";
  const childrenText = extractTextFromRichText(record.children);
  return `${ownText}${childrenText}`;
};

const containsHandoffSignal = (value: unknown): boolean => {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): boolean => {
    if (depth > 8 || current === null || current === undefined) return false;
    if (typeof current === "string") {
      return current.toLowerCase() === "handoff_to_agent";
    }
    if (typeof current !== "object") return false;
    if (seen.has(current)) return false;
    seen.add(current);

    for (const [key, nested] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase();
      if (
        (normalizedKey === "handoff" && nested === true) ||
        (normalizedKey === "event" && nested === "handoff_to_agent") ||
        (normalizedKey === "eventname" && nested === "handoff_to_agent") ||
        visit(nested, depth + 1)
      ) {
        return true;
      }
    }

    return false;
  };

  return visit(value, 0);
};

/**
 * Best-effort MIME type guess from URL extension.
 * Falls back to generic type-based default.
 */
const guessMimeType = (
  url: string,
  category: "image" | "video" | "audio",
): string | undefined => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split(".").pop();

    const mimeMap: Record<string, string> = {
      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      // Videos
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      // Audio
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      wav: "audio/wav",
      m4a: "audio/mp4",
    };

    if (ext && mimeMap[ext]) return mimeMap[ext];
  } catch {
    // URL parsing failed — ignore
  }

  // Default fallback by category
  const defaults: Record<string, string> = {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/mpeg",
  };

  return defaults[category];
};
