import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUsernameDto } from './update-username.dto';

function validate(payload: unknown) {
  return validateSync(plainToInstance(UpdateUsernameDto, payload), {
    whitelist: true,
  });
}

describe('UpdateUsernameDto', () => {
  it('accepts a username within the length limit', () => {
    expect(validate({ username: 'Ada Lovelace' })).toHaveLength(0);
  });

  it('accepts a username of exactly 50 characters', () => {
    expect(validate({ username: 'a'.repeat(50) })).toHaveLength(0);
  });

  it('accepts an empty string (clears the username)', () => {
    expect(validate({ username: '' })).toHaveLength(0);
  });

  it('accepts null (clears the username)', () => {
    expect(validate({ username: null })).toHaveLength(0);
  });

  it('accepts an omitted username', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('rejects a username longer than 50 characters', () => {
    const errors = validate({ username: 'a'.repeat(51) });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('rejects a non-string username', () => {
    const errors = validate({ username: 42 });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
