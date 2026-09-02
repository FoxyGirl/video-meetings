import { setAuthTokenProvider } from '@/shared/api';
import { getAuthSnapshot } from './model';

export {
  type AuthState,
  getAuthSnapshot,
  getServerAuthSnapshot,
  getUserId,
  setAuthState,
  subscribeAuth,
} from './model';
export { SessionProvider, useSession } from './ui/session-provider';

// Registers this entity as shared/api's token source — shared can't import
// entities/session directly (an upward import), so session hands its token
// getter over instead. Runs once, as a side effect of importing this
// module's public API, which every consumer of the session entity does.
setAuthTokenProvider(() => getAuthSnapshot()?.accessToken ?? null);
