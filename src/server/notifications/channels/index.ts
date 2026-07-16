/**
 * Channel adapter registry. Each adapter delivers one NotifyInput to one
 * user over one channel and returns a short outcome string ("sent",
 * "skipped:<reason>", ...) recorded on the notification row.
 *
 * NOTE: "inapp" is not an adapter — the service always writes the in-app row.
 */
import type { Db } from "@/server/db";
import type { NotifyInput } from "../service";

export interface RecipientUser {
  id: string;
  email: string;
  name: string | null;
}

export interface ChannelAdapter {
  send(db: Db, user: RecipientUser, input: NotifyInput): Promise<string>;
}

import { pushChannel } from "./push";
import { emailChannel } from "./email";

export const channelAdapters: Partial<Record<"push" | "email", ChannelAdapter>> = {
  push: pushChannel,
  email: emailChannel,
};
