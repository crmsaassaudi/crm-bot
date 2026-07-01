import { blockBaseSchema } from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { LogicBlockType } from "../constants";
import { HandoffTarget } from "./constants";

export const handoffBlockOptionsSchema = z.object({
  /** Which handoff mode: general (auto), group, or agent */
  target: z.nativeEnum(HandoffTarget).default(HandoffTarget.GENERAL),
  /** CRM group/team ID — only used when target = "group" */
  groupId: z.string().optional(),
  /** CRM group/team name — display label cached from selector */
  groupName: z.string().optional(),
  /** CRM agent user ID — only used when target = "agent" */
  agentId: z.string().optional(),
  /** CRM agent name — display label cached from selector */
  agentName: z.string().optional(),
  /** Optional farewell/transition message shown to visitor before handoff */
  message: z.string().optional(),
});

export type HandoffBlockOptions = z.infer<typeof handoffBlockOptionsSchema>;

export const handoffBlockSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([LogicBlockType.HANDOFF]),
    options: handoffBlockOptionsSchema.optional(),
  }),
);

export type HandoffBlock = z.infer<typeof handoffBlockSchema>;
