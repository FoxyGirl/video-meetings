'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, registerUser } from '@/lib/api';

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export default function RegisterPage() {
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email')?.toString() ?? '';
    const passwordValue = formData.get('password')?.toString() ?? '';

    setIsPending(true);
    try {
      await registerUser({ email, password: passwordValue });
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
                  Your account has been created successfully. You can now sign
                  in.
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

              <TextField
                isRequired
                minLength={8}
                name="password"
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                validate={(value) =>
                  value.length < 8
                    ? 'Password must be at least 8 characters.'
                    : null
                }
              >
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    autoComplete="new-password"
                    className="pr-10"
                    fullWidth
                    placeholder="••••••••"
                    variant="secondary"
                  />
                  <Button
                    isIconOnly
                    aria-label={
                      isPasswordVisible ? 'Hide password' : 'Show password'
                    }
                    className="absolute top-0 right-0 text-zinc-500 hover:text-foreground"
                    variant="ghost"
                    onPress={() => setIsPasswordVisible((visible) => !visible)}
                  >
                    {isPasswordVisible ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </Button>
                </div>
                <Description>Must be at least 8 characters.</Description>
                <FieldError />
              </TextField>

              <TextField
                isRequired
                name="confirmPassword"
                type={isConfirmPasswordVisible ? 'text' : 'password'}
                validate={(value) =>
                  value !== password ? 'Passwords do not match.' : null
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
                  <Button
                    isIconOnly
                    aria-label={
                      isConfirmPasswordVisible
                        ? 'Hide password'
                        : 'Show password'
                    }
                    className="absolute top-0 right-0 text-zinc-500 hover:text-foreground"
                    variant="ghost"
                    onPress={() =>
                      setIsConfirmPasswordVisible((visible) => !visible)
                    }
                  >
                    {isConfirmPasswordVisible ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </Button>
                </div>
                <FieldError />
              </TextField>

              <Button
                className="mt-2"
                fullWidth
                isPending={isPending}
                type="submit"
              >
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isPending ? 'Creating account…' : 'Create account'}
              </Button>
            </Form>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
