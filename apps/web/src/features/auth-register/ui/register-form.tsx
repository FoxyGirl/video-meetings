'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
  toast,
} from '@heroui/react';
import { PasswordConfirmField } from '@/components/password-confirm-field';
import { ApiError } from '@/shared/api';
import { useSession } from '@/entities/session';
import { EMAIL_PATTERN } from '@/lib/email';
import { registerUser } from '../api';

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const router = useRouter();
  const { login } = useSession();
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email')?.toString() ?? '';
    const passwordValue = formData.get('password')?.toString() ?? '';

    setIsPending(true);
    try {
      const { accessToken } = await registerUser({
        email,
        password: passwordValue,
      });
      login({ accessToken, email });
      toast.success('Account created', {
        description: 'Redirecting you to your meetings…',
      });
      router.push('/');
    } catch (error) {
      toast.danger(
        error instanceof ApiError
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <Card.Header>
        <Card.Title>Create your account</Card.Title>
        <Card.Description>
          Sign up to start scheduling and joining meetings.
        </Card.Description>
      </Card.Header>

      <Card.Content>
        <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <TextField
            isRequired
            name="email"
            type="email"
            validate={(value) =>
              EMAIL_PATTERN.test(value) ? null : 'Enter a valid email address.'
            }
          >
            <Label>Email</Label>
            <Input
              autoComplete="email"
              placeholder="you@example.com"
              variant="secondary"
            />
            <FieldError />
          </TextField>

          <PasswordConfirmField
            description={`Must be at least ${MIN_PASSWORD_LENGTH} characters.`}
            onValidate={(value) =>
              value.length < MIN_PASSWORD_LENGTH
                ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
                : null
            }
            value={password}
            onChangeValue={setPassword}
          />

          <Button
            className="mt-2"
            fullWidth
            isPending={isPending}
            type="submit"
          >
            {isPending ? <Spinner color="current" size="sm" /> : null}
            {isPending ? 'Creating account…' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            Already have an account?{' '}
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              href="/login"
            >
              Sign in
            </Link>
          </p>
        </Form>
      </Card.Content>
    </Card>
  );
}
