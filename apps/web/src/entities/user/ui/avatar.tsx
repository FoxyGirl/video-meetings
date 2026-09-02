'use client';

import { Avatar as HeroAvatar } from '@heroui/react';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/shared/api';
import { getAvatarBlob } from '@/lib/api';
import type { UserProfile } from '../api';
import { useUser } from './user-provider';

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
// currently fetch. Reads identity from UserProvider's context itself rather
// than taking it as props, so every call site (profile page, edit page,
// main page) automatically shows the current user and can't be pointed at
// someone else's data by mistake.
export function CurrentUserAvatar({ size, className }: CurrentUserAvatarProps) {
  const { hasSession, email, profile, profileError, logout } = useUser();
  const avatarUrl = useAvatarImageUrl(
    profile?.avatarMimeType,
    profile?.avatarUploadedAt,
    logout,
  );

  if (!hasSession) {
    return null;
  }

  // Profile fetch still in flight: render a neutral, empty circle rather
  // than initials derived from the session's own email — those can be a
  // third state that's wrong in both directions (not the eventual
  // username-derived initials, and not the avatar image either), flashing
  // before the real one paints a moment later. `profileError` still counts
  // as "settled", so a failed fetch falls through to the email-derived
  // initials below rather than getting stuck on the empty placeholder
  // forever.
  if (!profile && !profileError) {
    return <HeroAvatar size={size} className={className} />;
  }

  return (
    <UserAvatar
      email={profile?.email ?? email ?? ''}
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
  logout: () => void,
): string | null {
  const key = avatarMimeType ? `${avatarMimeType}:${avatarUploadedAt}` : null;
  const [fetched, setFetched] = useState<{ key: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!key || cachedAvatarPreview?.key === key) {
      // Either nothing to fetch, or cacheAvatarPreview (see below) already
      // has this exact avatar's bytes from a just-completed upload — skip
      // the network round trip entirely. The render below reads straight
      // from the cache in that case rather than mirroring it into
      // `fetched` state.
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
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          // Session is no longer valid — clear it, same as auth-context's
          // own profile fetch. Any other failure degrades to the initials
          // placeholder instead: a broken avatar image shouldn't block the
          // rest of the page.
          logout();
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [key, logout]);

  if (key && cachedAvatarPreview?.key === key) {
    return cachedAvatarPreview.url;
  }

  return fetched?.key === key ? fetched.url : null;
}

let cachedAvatarPreview: { key: string; url: string } | null = null;

// Called right after a successful avatar upload (see AvatarUpload), while
// the file's bytes are already in hand — seeds useAvatarImageUrl's cache so
// it can skip re-fetching the exact same bytes the browser just finished
// sending. Purely an optimistic shortcut: if this is never called, or the
// key it computes doesn't end up matching (e.g. the server ever
// normalizes avatarUploadedAt differently), useAvatarImageUrl's normal
// getAvatarBlob() fetch still runs as the fallback source of truth. The
// previous preview (if any) is revoked before being replaced; the very
// last one is simply left for the browser to reclaim on tab close rather
// than tracked for cleanup on logout — one small leftover blob isn't worth
// the extra plumbing.
export function cacheAvatarPreview(profile: UserProfile, file: File): void {
  if (!profile.avatarMimeType) {
    return;
  }
  const key = `${profile.avatarMimeType}:${profile.avatarUploadedAt}`;
  const url = URL.createObjectURL(file);
  if (cachedAvatarPreview) {
    URL.revokeObjectURL(cachedAvatarPreview.url);
  }
  cachedAvatarPreview = { key, url };
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
