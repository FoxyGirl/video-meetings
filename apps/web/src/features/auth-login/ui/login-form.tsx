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
import { useAuth } from '@/lib/auth-context';
import { EMAIL_PATTERN } from '@/lib/email';
import { loginUser } from '../api';

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email')?.toString() ?? '';
    const passwordValue = formData.get('password')?.toString() ?? '';

    setIsPending(true);
    try {
      const { accessToken } = await loginUser({
        email,
        password: passwordValue,
      });
      login({ accessToken, email });
      toast.success('Signed in', {
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
        <Card.Title>Sign in</Card.Title>
        <Card.Description>
          Enter your credentials to access your meetings.
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
            withConfirmField={false}
            onValidate={(value) =>
              value.length === 0 ? 'Enter your password.' : null
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
            {isPending ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            Don&apos;t have an account?{' '}
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              href="/register"
            >
              Create one
            </Link>
          </p>
        </Form>
      </Card.Content>
    </Card>
  );
}
