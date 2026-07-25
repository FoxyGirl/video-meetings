import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ACCEPTED_FILE_TYPES } from './file-upload.constants';

export function validateFileType(originalname: string, mimetype: string): void {
  const extension = extname(originalname).toLowerCase();
  const expectedMimeType = ACCEPTED_FILE_TYPES[extension];

  if (!expectedMimeType) {
    throw new BadRequestException(
      `File extension "${extension}" is not supported. Accepted extensions: ${Object.keys(
        ACCEPTED_FILE_TYPES,
      ).join(', ')}.`,
    );
  }

  if (!Object.values(ACCEPTED_FILE_TYPES).includes(mimetype)) {
    throw new BadRequestException(`MIME type "${mimetype}" is not supported.`);
  }

  if (expectedMimeType !== mimetype) {
    throw new BadRequestException(
      `File extension "${extension}" does not match declared MIME type "${mimetype}".`,
    );
  }
}
