import { join } from 'node:path';

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

export const MAX_UPLOAD_FILE_SIZE_BYTES =
  Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES) || 500 * 1024 * 1024;
