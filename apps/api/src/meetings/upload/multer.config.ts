import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  getUploadDir,
} from './file-upload.constants';
import { validateFileType } from './validate-file-type';

export const meetingFileUploadOptions: MulterOptions = {
  storage: diskStorage({
    // A function, not a static path, so the directory is resolved per
    // upload rather than once when this module is first required.
    destination: (_req, _file, callback) => callback(null, getUploadDir()),
    // Never trust the client's original name for the on-disk name (path
    // traversal defense); the original name is kept separately as metadata.
    filename: (_req, file, callback) =>
      callback(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  // Cheap first-pass rejection before any bytes are written to disk. The
  // handler re-validates authoritatively (see UploadMeetingFileHandler).
  fileFilter: (_req, file, callback) => {
    try {
      validateFileType(file.originalname, file.mimetype);
      callback(null, true);
    } catch (error) {
      callback(error as Error, false);
    }
  },
};
