/**
 * Client-safe meeting helpers (the server twin lives in server/dal/meetings).
 */
import type { MeetingUtterance } from "@/lib/types";

/** Friendly copy for Recall bot status codes shown while a bot is out. */
export const BOT_STATUS_COPY: Record<string, string> = {
  ready: "Bot is getting ready",
  joining_call: "Bot is joining the call",
  in_waiting_room: "Bot is in the waiting room, let it in",
  in_call_not_recording: "Bot is in the call",
  recording_permission_allowed: "Bot is in the call",
  in_call_recording: "Bot is in the call, recording",
  call_ended: "Call ended, waiting for the recording",
  done: "Fetching the recording",
  recording_permission_denied: "The host declined recording",
  fatal: "The bot couldn't join",
};

export function botStatusCopy(code: string | null | undefined): string {
  return (code && BOT_STATUS_COPY[code]) || "Bot is on its way";
}

export function speakerLabel(
  speaker: number,
  names: Record<string, string> | null | undefined,
): string {
  return names?.[String(speaker)] ?? `Speaker ${speaker + 1}`;
}

/** Distinct speakers in order of first appearance. */
export function speakersIn(utterances: MeetingUtterance[]): number[] {
  const seen = new Set<number>();
  for (const u of utterances) seen.add(u.speaker);
  return [...seen];
}
