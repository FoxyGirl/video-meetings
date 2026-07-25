import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from './file-upload.constants';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds the maximum allowed size of ${MAX_UPLOAD_FILE_SIZE_BYTES} bytes.`
        : exception.message;

    response.status(400).json({ statusCode: 400, message });
  }
}
