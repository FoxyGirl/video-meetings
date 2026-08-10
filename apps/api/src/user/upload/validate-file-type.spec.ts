import { describe, it, expect } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { validateFileType } from './validate-file-type';

describe('validateFileType (avatar)', () => {
  it('accepts a file whose extension and MIME type are both allowed and match', () => {
    expect(() => validateFileType('avatar.png', 'image/png')).not.toThrow();
  });

  it('rejects a disallowed extension', () => {
    expect(() =>
      validateFileType('malware.exe', 'application/octet-stream'),
    ).toThrow(BadRequestException);
  });

  it('rejects a disallowed MIME type', () => {
    expect(() =>
      validateFileType('avatar.png', 'application/octet-stream'),
    ).toThrow(BadRequestException);
  });

  it('rejects an extension/MIME type mismatch', () => {
    expect(() => validateFileType('avatar.png', 'image/webp')).toThrow(
      BadRequestException,
    );
  });

  it('is case-insensitive on the extension', () => {
    expect(() => validateFileType('avatar.PNG', 'image/png')).not.toThrow();
  });
});
