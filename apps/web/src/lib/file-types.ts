// Extension -> declared MIME type. Mirrored from
// apps/api/src/meetings/upload/file-upload.constants.ts — keep both tables
// identical if either changes; the two apps don't share code.
export const ACCEPTED_FILE_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

// Mirrors the server's default (apps/api's MAX_UPLOAD_FILE_SIZE_BYTES) —
// this client-side copy is a fixed UX fast-fail, not the authority; the
// server remains the real limit even if MAX_UPLOAD_FILE_SIZE_BYTES is
// overridden per environment there.
export const MAX_UPLOAD_FILE_SIZE_BYTES = 500 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Adaptive-unit formatter for displaying an arbitrary stored file's actual
// size (e.g. a small test recording) — unlike formatBytes above, which only
// ever formats large, MB-scale thresholds (max size, "too large" messages)
// and would misleadingly show "0 MB" for anything under 500 KB.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? null : fileName.slice(dotIndex).toLowerCase();
}

// UX-level fast-fail against the same table the server validates
// authoritatively — a client can lie about a file's extension or MIME type,
// so this never replaces the server-side check, it just avoids a pointless
// round trip for the common case of an obviously wrong file.
export function validateFile(file: File): string | null {
  const extension = getExtension(file.name);
  const expectedMimeType = extension ? ACCEPTED_FILE_TYPES[extension] : null;

  if (!extension || !expectedMimeType) {
    return `Unsupported file type. Accepted formats: ${Object.keys(ACCEPTED_FILE_TYPES).join(', ')}.`;
  }

  if (file.type && file.type !== expectedMimeType) {
    return `This file's type (${file.type}) doesn't match its extension (${extension}).`;
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${formatBytes(MAX_UPLOAD_FILE_SIZE_BYTES)}.`;
  }

  return null;
}
