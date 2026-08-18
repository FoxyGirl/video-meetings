import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

function validate(payload: unknown) {
  return validateSync(plainToInstance(ChangePasswordDto, payload), {
    whitelist: true,
  });
}

describe('ChangePasswordDto', () => {
  it('accepts a valid current and new password', () => {
    expect(
      validate({ currentPassword: 'oldpass', newPassword: 'newpassword1' }),
    ).toHaveLength(0);
  });

  it('accepts a new password of exactly 8 characters', () => {
    expect(
      validate({ currentPassword: 'oldpass', newPassword: 'a'.repeat(8) }),
    ).toHaveLength(0);
  });

  it('rejects a missing currentPassword', () => {
    const errors = validate({ newPassword: 'newpassword1' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('currentPassword');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('rejects an empty currentPassword', () => {
    const errors = validate({
      currentPassword: '',
      newPassword: 'newpassword1',
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('currentPassword');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('rejects a non-string currentPassword', () => {
    const errors = validate({
      currentPassword: 42,
      newPassword: 'newpassword1',
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('currentPassword');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('rejects a missing newPassword', () => {
    const errors = validate({ currentPassword: 'oldpass' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('newPassword');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('rejects a newPassword shorter than 8 characters', () => {
    const errors = validate({
      currentPassword: 'oldpass',
      newPassword: 'a'.repeat(7),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('newPassword');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('rejects a non-string newPassword', () => {
    const errors = validate({ currentPassword: 'oldpass', newPassword: 42 });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('newPassword');
    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
