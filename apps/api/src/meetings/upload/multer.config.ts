import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  UPLOAD_DIR,
} from './file-upload.constants';

export const meetingFileUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    // Never trust the client's original name for the on-disk name (path
    // traversal defense); the original name is kept separately as metadata.
    filename: (_req, file, callback) =>
      callback(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
};
