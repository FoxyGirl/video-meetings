import { formatBytes } from './file-types';

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

function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? null : fileName.slice(dotIndex).toLowerCase();
}

// UX-level fast-fail against the same table the server validates
// authoritatively — a client can lie about a file's extension or MIME type,
// so this never replaces the server-side check, it just avoids a pointless
// round trip for the common case of an obviously wrong file.
export function validateAvatarFile(file: File): string | null {
  const extension = getExtension(file.name);
  const expectedMimeType = extension ? ACCEPTED_AVATAR_TYPES[extension] : null;

  if (!extension || !expectedMimeType) {
    return `Unsupported file type. Accepted formats: ${Object.keys(ACCEPTED_AVATAR_TYPES).join(', ')}.`;
  }

  if (file.type && file.type !== expectedMimeType) {
    return `This file's type (${file.type}) doesn't match its extension (${extension}).`;
  }

  if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${formatBytes(MAX_AVATAR_FILE_SIZE_BYTES)}.`;
  }

  return null;
}
