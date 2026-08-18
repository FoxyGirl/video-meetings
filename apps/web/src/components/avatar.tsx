'use client';

import { Avatar as HeroAvatar } from '@heroui/react';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { getAvatarBlob } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface UserAvatarProps {
  username?: string | null;
  email: string;
  imageUrl?: string | null;
  size?: ComponentProps<typeof HeroAvatar>['size'];
  className?: string;
}

// Purely presentational — takes an already-resolved image URL instead of
// fetching one itself, so it can render *any* user's identity without a
// signature that quietly assumes "the current user". The only avatar image
// this app can fetch belongs to the logged-in user (GET /users/me/avatar
// has no :id variant) — CurrentUserAvatar below is the one place that
// bridges that gap; a future participant/meeting-list avatar should use
// this component directly with its own imageUrl, not reach for
// CurrentUserAvatar.
export function UserAvatar({
  username,
  email,
  imageUrl,
  size,
  className,
}: UserAvatarProps) {
  return (
    <HeroAvatar size={size} className={className}>
      {imageUrl ? <HeroAvatar.Image alt="" src={imageUrl} /> : null}
      <HeroAvatar.Fallback>{getInitials(username, email)}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}

interface CurrentUserAvatarProps {
  size?: ComponentProps<typeof HeroAvatar>['size'];
  className?: string;
}

// Renders the logged-in user's own avatar — the only avatar this app can
// currently fetch. Reads identity from auth-context itself rather than
// taking it as props, so every call site (profile page, edit page, main
// page) automatically shows the current user and can't be pointed at
// someone else's data by mistake.
export function CurrentUserAvatar({ size, className }: CurrentUserAvatarProps) {
  const { auth, profile, profileError } = useAuth();
  const avatarUrl = useAvatarImageUrl(
    profile?.avatarMimeType,
    profile?.avatarUploadedAt,
  );

  if (!auth) {
    return null;
  }

  // Profile fetch still in flight: render a neutral, empty circle rather
  // than initials derived from `auth.email` — those can be a third state
  // that's wrong in both directions (not the eventual username-derived
  // initials, and not the avatar image either), flashing before the real
  // one paints a moment later. `profileError` still counts as "settled",
  // so a failed fetch falls through to the email-derived initials below
  // rather than getting stuck on the empty placeholder forever.
  if (!profile && !profileError) {
    return <HeroAvatar size={size} className={className} />;
  }

  return (
    <UserAvatar
      email={profile?.email ?? auth.email}
      username={profile?.username}
      imageUrl={avatarUrl}
      size={size}
      className={className}
    />
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
