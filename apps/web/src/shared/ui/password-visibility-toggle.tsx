'use client';

import { Button } from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordVisibilityToggle({
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
