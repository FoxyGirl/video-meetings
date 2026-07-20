'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const mounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();

  if (!mounted) {
    return null;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      isIconOnly
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed top-4 right-4"
      variant="secondary"
      onPress={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </Button>
  );
}
