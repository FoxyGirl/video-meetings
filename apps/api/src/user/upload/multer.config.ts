import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  AVATAR_UPLOAD_DIR,
  MAX_AVATAR_FILE_SIZE_BYTES,
} from './avatar-upload.constants';
import { validateFileType } from './validate-file-type';

export const avatarUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, callback) => callback(null, AVATAR_UPLOAD_DIR),
    // Never trust the client's original name for the on-disk name (path
    // traversal defense); the original name is kept separately as metadata.
    filename: (_req, file, callback) =>
      callback(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_AVATAR_FILE_SIZE_BYTES },
  // Cheap first-pass rejection before any bytes are written to disk. The
  // handler re-validates authoritatively (same as meeting file upload).
  fileFilter: (_req, file, callback) => {
    try {
      validateFileType(file.originalname, file.mimetype);
      callback(null, true);
    } catch (error) {
      callback(error as Error, false);
    }
  },
};
