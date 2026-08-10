import { validateFileAgainstTypes } from './file-types';

// Mirrors the server's default (apps/api's MAX_AVATAR_FILE_SIZE_BYTES) —
// this client-side copy is a fixed UX fast-fail, not the authority; the
// server remains the real limit even if MAX_AVATAR_FILE_SIZE_BYTES is
// overridden per environment there.
export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Extension -> declared MIME type. Mirrored from
// apps/api/src/user/upload/avatar-upload.constants.ts — keep both tables
// identical if either changes; the two apps don't share code.
export const ACCEPTED_AVATAR_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function validateAvatarFile(file: File): string | null {
  return validateFileAgainstTypes(
    file,
    ACCEPTED_AVATAR_TYPES,
    MAX_AVATAR_FILE_SIZE_BYTES,
  );
}
