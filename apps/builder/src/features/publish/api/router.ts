import { authenticatedProcedure } from "@typebot.io/config/orpc/builder/middlewares";
import { z } from "zod";
import {
  handleListCrmChannels,
  listCrmChannelsInputSchema,
} from "./handleListCrmChannels";
import {
  handleUpdateChannelBindings,
  updateChannelBindingsInputSchema,
} from "./handleUpdateChannelBindings";

const listCrmChannels = authenticatedProcedure
  .input(listCrmChannelsInputSchema)
  .output(
    z.object({
      channels: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          account: z.string().optional(),
          status: z.string().optional(),
          isBound: z.boolean(),
        }),
      ),
    }),
  )
  .handler(handleListCrmChannels);

const updateChannelBindings = authenticatedProcedure
  .input(updateChannelBindingsInputSchema)
  .output(z.object({ ok: z.boolean(), channelIds: z.array(z.string()) }))
  .handler(handleUpdateChannelBindings);

export type CrmChannelsRouter = {
  listCrmChannels: typeof listCrmChannels;
  updateChannelBindings: typeof updateChannelBindings;
};

export const crmChannelsRouter: CrmChannelsRouter = {
  listCrmChannels,
  updateChannelBindings,
};
