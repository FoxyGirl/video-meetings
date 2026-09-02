'use client';

import { RegisterForm } from '@/features/auth-register';

export default function RegisterPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Video Meetings
      </h1>

      <RegisterForm />
    </div>
  );
}
