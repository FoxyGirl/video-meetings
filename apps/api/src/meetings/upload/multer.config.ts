import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  getUploadDir,
} from './file-upload.constants';

const storage = diskStorage({
  // A function, not a static path, so the directory is resolved per
  // upload rather than once when this module is first required.
  destination: (_req, _file, callback) => callback(null, getUploadDir()),
  // Never trust the client's original name for the on-disk name (path
  // traversal defense); the original name is kept separately as metadata.
  filename: (_req, file, callback) =>
    callback(
      null,
      `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
    ),
});

// Multi-file batch upload (POST /meetings/:id/files): deliberately has no
// fileFilter. A batch must tolerate individual invalid files without
// aborting the other, valid ones in the same request — Multer's fileFilter
// contract doesn't support that (calling back with an error there fails the
// whole request), so every file is written to disk unconditionally here and
// type-validated authoritatively, per file, in UploadMeetingFileHandler,
// which also cleans up the on-disk bytes for whichever files it rejects.
export const meetingFilesUploadOptions: MulterOptions = {
  storage,
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
};
