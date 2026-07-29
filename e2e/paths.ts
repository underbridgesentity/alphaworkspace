import path from "node:path";

/** Saved signed-in session, written by auth.setup.ts and read by the specs. */
export const STATE = path.join(__dirname, ".auth/owner.json");
