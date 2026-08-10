// Mirrors the server's default (apps/api's MAX_AVATAR_FILE_SIZE_BYTES) —
// this client-side copy is a fixed UX fast-fail, not the authority; the
// server remains the real limit even if MAX_AVATAR_FILE_SIZE_BYTES is
// overridden per environment there.
export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
