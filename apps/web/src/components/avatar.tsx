'use client';

import { Avatar as HeroAvatar } from '@heroui/react';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { getAvatarBlob } from '@/lib/api';

interface UserAvatarProps {
  username?: string | null;
  email: string;
  avatarMimeType?: string | null;
  avatarUploadedAt?: string | null;
  size?: ComponentProps<typeof HeroAvatar>['size'];
  className?: string;
}

export function UserAvatar({
  username,
  email,
  avatarMimeType,
  avatarUploadedAt,
  size,
  className,
}: UserAvatarProps) {
  const avatarUrl = useAvatarImageUrl(avatarMimeType, avatarUploadedAt);

  return (
    <HeroAvatar size={size} className={className}>
      {avatarUrl ? <HeroAvatar.Image alt="" src={avatarUrl} /> : null}
      <HeroAvatar.Fallback>{getInitials(username, email)}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}

// Fetches the avatar image as a Bearer-authenticated blob (see
// getAvatarBlob's own comment for why a plain <img src> can't do this) and
// exposes it as an object URL, kept alive for as long as it's rendered and
// revoked on unmount or when a newer avatar replaces it. Keyed on
// avatarUploadedAt (not just avatarMimeType) since re-uploading a same-type
// image changes the underlying bytes without changing the mime type. The
// fetched url is tagged with the key it was fetched for and only returned
// while that key still matches the current props, rather than resetting to
// null synchronously inside the effect (which would trigger a cascading
// render on every avatarMimeType/avatarUploadedAt change).
function useAvatarImageUrl(
  avatarMimeType: string | null | undefined,
  avatarUploadedAt: string | null | undefined,
): string | null {
  const key = avatarMimeType ? `${avatarMimeType}:${avatarUploadedAt}` : null;
  const [fetched, setFetched] = useState<{ key: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!key) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    getAvatarBlob()
      .then((blob) => {
        if (cancelled || !blob) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setFetched({ key, url: objectUrl });
      })
      .catch(() => {
        // Degrade to the initials placeholder on any fetch failure — a
        // broken avatar image shouldn't block the rest of the page.
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [key]);

  return fetched?.key === key ? fetched.url : null;
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
