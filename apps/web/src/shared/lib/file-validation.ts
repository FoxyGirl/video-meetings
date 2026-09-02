export function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? null : fileName.slice(dotIndex).toLowerCase();
}

export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// UX-level fast-fail against a caller-supplied extension -> MIME table — a
// client can lie about a file's extension or MIME type, so this never
// replaces the server-side check, it just avoids a pointless round trip for
// the common case of an obviously wrong file. Shared by entities/meeting-file
// and lib/avatar-file-types.ts, which check the same three things
// (extension, declared MIME, size) against different tables/limits.
export function validateFileAgainstTypes(
  file: File,
  acceptedTypes: Readonly<Record<string, string>>,
  maxSizeBytes: number,
): string | null {
  const extension = getExtension(file.name);
  const expectedMimeType = extension ? acceptedTypes[extension] : null;

  if (!extension || !expectedMimeType) {
    return `Unsupported file type. Accepted formats: ${Object.keys(acceptedTypes).join(', ')}.`;
  }

  if (file.type && file.type !== expectedMimeType) {
    return `This file's type (${file.type}) doesn't match its extension (${extension}).`;
  }

  if (file.size > maxSizeBytes) {
    return `File is too large. Maximum size is ${formatBytes(maxSizeBytes)}.`;
  }

  return null;
}
