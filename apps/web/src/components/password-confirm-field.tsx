'use client';

import { useState, type ReactNode } from 'react';
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordConfirmFieldProps {
  value: string;
  onChangeValue: (value: string) => void;
  onValidate: (value: string) => string | null;
  description?: ReactNode;
  withConfirmField?: boolean;
}

export function PasswordConfirmField({
  value,
  onChangeValue,
  onValidate,
  description,
  withConfirmField = true,
}: PasswordConfirmFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);

  return (
    <>
      <TextField
        isRequired
        name="password"
        type={isPasswordVisible ? 'text' : 'password'}
        value={value}
        onChange={onChangeValue}
        validate={onValidate}
      >
        <Label>Password</Label>
        <div className="relative">
          <Input
            autoComplete={
              withConfirmField ? 'new-password' : 'current-password'
            }
            className="pr-10"
            fullWidth
            placeholder="••••••••"
            variant="secondary"
          />
          <PasswordVisibilityToggle
            isVisible={isPasswordVisible}
            onToggle={() => setIsPasswordVisible((visible) => !visible)}
          />
        </div>
        {description ? <Description>{description}</Description> : null}
        <FieldError />
      </TextField>

      {withConfirmField ? (
        <TextField
          isRequired
          name="confirmPassword"
          type={isConfirmPasswordVisible ? 'text' : 'password'}
          validate={(confirmValue) =>
            confirmValue !== value ? 'Passwords do not match.' : null
          }
        >
          <Label>Confirm password</Label>
          <div className="relative">
            <Input
              autoComplete="new-password"
              className="pr-10"
              fullWidth
              placeholder="••••••••"
              variant="secondary"
            />
            <PasswordVisibilityToggle
              isVisible={isConfirmPasswordVisible}
              onToggle={() =>
                setIsConfirmPasswordVisible((visible) => !visible)
              }
            />
          </div>
          <FieldError />
        </TextField>
      ) : null}
    </>
  );
}

function PasswordVisibilityToggle({
  isVisible,
  onToggle,
}: {
  isVisible: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      isIconOnly
      aria-label={isVisible ? 'Hide password' : 'Show password'}
      className="absolute top-0 right-0 text-zinc-500 hover:text-foreground"
      variant="ghost"
      onPress={onToggle}
    >
      {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
    </Button>
  );
}
