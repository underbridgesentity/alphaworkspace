/**
 * The fixed reaction palette, shared by the picker and the API validator.
 * Deliberately small and calm: acknowledge, approve, appreciate, celebrate,
 * amuse, watching. Not a full emoji keyboard by design.
 */
export const REACTION_EMOJI = ["👍", "✅", "❤️", "🎉", "😂", "👀"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
