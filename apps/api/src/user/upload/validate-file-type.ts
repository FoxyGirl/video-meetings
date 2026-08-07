import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ACCEPTED_AVATAR_TYPES } from './avatar-upload.constants';

export function validateFileType(originalname: string, mimetype: string): void {
  const extension = extname(originalname).toLowerCase();
  const expectedMimeType = ACCEPTED_AVATAR_TYPES[extension];

  if (!expectedMimeType) {
    throw new BadRequestException(
      `File extension "${extension}" is not supported. Accepted extensions: ${Object.keys(
        ACCEPTED_AVATAR_TYPES,
      ).join(', ')}.`,
    );
  }

  if (!Object.values(ACCEPTED_AVATAR_TYPES).includes(mimetype)) {
    throw new BadRequestException(`MIME type "${mimetype}" is not supported.`);
  }

  if (expectedMimeType !== mimetype) {
    throw new BadRequestException(
      `File extension "${extension}" does not match declared MIME type "${mimetype}".`,
    );
  }
}
