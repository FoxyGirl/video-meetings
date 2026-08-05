'use client';

import { Avatar as HeroAvatar } from '@heroui/react';
import type { ComponentProps } from 'react';

interface UserAvatarProps {
  username?: string | null;
  email: string;
  size?: ComponentProps<typeof HeroAvatar>['size'];
  className?: string;
}

export function UserAvatar({
  username,
  email,
  size,
  className,
}: UserAvatarProps) {
  return (
    <HeroAvatar size={size} className={className}>
      <HeroAvatar.Fallback>{getInitials(username, email)}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}

function getInitials(
  username: string | null | undefined,
  email: string,
): string {
  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    const words = trimmedUsername.split(/\s+/);
    if (words.length > 1) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return words[0].slice(0, 2).toUpperCase();
  }

  const localPart = email.split('@')[0];
  return localPart.slice(0, 2).toUpperCase();
}
