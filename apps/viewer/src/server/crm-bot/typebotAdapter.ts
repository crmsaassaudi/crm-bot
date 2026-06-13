import { handleContinueChat } from "@typebot.io/bot-engine/api/handleContinueChat";
import { handleStartChat } from "@typebot.io/bot-engine/api/handleStartChat";
import type {
  BotReplyResponse,
  BotReplyButton,
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
};

export class TypebotAdapter {
  async reply(input: TypebotAdapterInput): Promise<BotReplyResponse> {
    if (input.sessionId) {
      const response = await handleContinueChat({
        input: {
          sessionId: input.sessionId,
          message: { type: "text", text: input.text },
          textBubbleContentFormat: "markdown",
        },
        context: {},
      });

      return normalizeTypebotResponse(response, input.sessionId);
    }

    const response = await handleStartChat({
      input: {
        publicId: input.flowId,
        message: { type: "text", text: input.text },
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
): BotReplyResponse => {
  const messages = (response.messages ?? [])
    .map(normalizeBubble)
    .filter((message: any) => message?.text?.trim());

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

const normalizeBubble = (bubble: any) => {
  if (bubble?.type !== "text") return null;

  const text =
    bubble.content?.type === "markdown"
      ? bubble.content.markdown
      : extractTextFromRichText(bubble.content?.richText);

  return {
    type: "text" as const,
    text: text.trim(),
    raw: bubble,
  };
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
