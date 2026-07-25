import { describe, it, expect } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { validateFileType } from './validate-file-type';

describe('validateFileType', () => {
  it('accepts a file whose extension and MIME type are both allowed and match', () => {
    expect(() => validateFileType('recording.mp4', 'video/mp4')).not.toThrow();
  });

  it('rejects a disallowed extension', () => {
    expect(() =>
      validateFileType('malware.exe', 'application/octet-stream'),
    ).toThrow(BadRequestException);
  });

  it('rejects a disallowed MIME type', () => {
    expect(() =>
      validateFileType('recording.mp4', 'application/octet-stream'),
    ).toThrow(BadRequestException);
  });

  it('rejects an extension/MIME type mismatch', () => {
    expect(() => validateFileType('recording.mp4', 'audio/mpeg')).toThrow(
      BadRequestException,
    );
  });

  it('is case-insensitive on the extension', () => {
    expect(() => validateFileType('recording.MP4', 'video/mp4')).not.toThrow();
  });
});
