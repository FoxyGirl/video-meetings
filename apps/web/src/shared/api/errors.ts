import axios from 'axios';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractServerMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('message' in data)) {
    return undefined;
  }
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  // class-validator DTO failures come back as a string[] (one entry per
  // failed rule) via Nest's default ValidationPipe, not a single string.
  if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
    return (message as string[]).join(' ');
  }
  return undefined;
}

// Axios rejects on non-2xx (unlike fetch, which only exposes res.ok), so
// every call site funnels its catch through here to normalize onto the
// existing ApiError shape. statusMessages lets a call site override the
// server's raw message with a friendlier one for specific statuses; when no
// override matches, the server's own message is used (e.g. upload
// validation errors, which are already specific per-case strings).
export function toApiError(
  error: unknown,
  statusMessages: Record<number, string> = {},
): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const message =
      statusMessages[status] ??
      extractServerMessage(error.response?.data) ??
      'Something went wrong. Please try again.';
    return new ApiError(message, status);
  }
  return new ApiError('Something went wrong. Please try again.', 0);
}
