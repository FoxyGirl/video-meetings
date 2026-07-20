'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';
import { PasswordConfirmField } from '@/components/password-confirm-field';
import { ApiError, registerUser } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MIN_PASSWORD_LENGTH = 8;
const REDIRECT_DELAY_MS = 1500;

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!isRegistered) {
      return;
    }
    const timeout = setTimeout(() => {
      router.push('/');
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isRegistered, router]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

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
      setIsRegistered(true);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Video Meetings
      </h1>

      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Create your account</Card.Title>
          <Card.Description>
            Sign up to start scheduling and joining meetings.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          {isRegistered ? (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Account created</Alert.Title>
                <Alert.Description>
                  Your account has been created successfully. Redirecting you to
                  your meetings…
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
              {submitError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{submitError}</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField
                isRequired
                name="email"
                type="email"
                validate={(value) =>
                  EMAIL_PATTERN.test(value)
                    ? null
                    : 'Enter a valid email address.'
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
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
