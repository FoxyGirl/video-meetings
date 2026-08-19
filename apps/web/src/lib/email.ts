// Shared across /login, /register, and /meetings/new — keep a single copy so
// a future tweak to the pattern doesn't need syncing across pages by hand.
export const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
