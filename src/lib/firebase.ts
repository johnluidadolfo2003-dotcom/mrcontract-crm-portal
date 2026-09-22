import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { isGoogleAccessTokenFresh } from './googleToken';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || undefined);

const createGoogleProvider = (forceAccountSelection = false) => {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar');
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  if (forceAccountSelection) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
};

export const googleProvider = createGoogleProvider();

let cachedGoogleAccessToken: string | null = null;
const ACCESS_TOKEN_STORAGE_KEY = 'mrcontract_google_access_token';
const ACCESS_TOKEN_ISSUED_AT_STORAGE_KEY = 'mrcontract_google_access_token_issued_at';

export const getCachedAccessToken = (): string | null => {
  if (cachedGoogleAccessToken) return cachedGoogleAccessToken;
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      const issuedAtValue = sessionStorage.getItem(ACCESS_TOKEN_ISSUED_AT_STORAGE_KEY);
      const issuedAt = issuedAtValue ? Number(issuedAtValue) : null;
      if (stored && isGoogleAccessTokenFresh(issuedAt)) {
        cachedGoogleAccessToken = stored;
        return stored;
      }
      if (stored) {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(ACCESS_TOKEN_ISSUED_AT_STORAGE_KEY);
      }
    } catch {}
  }
  return null;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedGoogleAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
        sessionStorage.setItem(ACCESS_TOKEN_ISSUED_AT_STORAGE_KEY, String(Date.now()));
      } else {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(ACCESS_TOKEN_ISSUED_AT_STORAGE_KEY);
      }
    } catch {}
  }
};

export const clearCachedAccessToken = () => {
  setCachedAccessToken(null);
};

let activeSignInPromise: Promise<{ user: User; accessToken: string | null }> | null = null;

export const initAuth = (
  onAuthSuccess?: (user: any) => void,
  onAuthFailure?: () => void
) => {
  const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user);
    } else {
      clearCachedAccessToken();
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    unsubscribe();
  };
};

export const googleSignIn = async (_force?: boolean): Promise<{ user: User; accessToken: string | null }> => {
  if (activeSignInPromise) {
    return activeSignInPromise as any;
  }

  activeSignInPromise = (async () => {
    try {
      // Reconnect with the existing Google browser session when possible.
      // Account selection is reserved for an explicit full sign-in.
      const provider = createGoogleProvider(_force === true);
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || null;
      if (accessToken) {
        setCachedAccessToken(accessToken);
      }
      return { user: result.user, accessToken };
    } catch (error: any) {
      console.warn('Sign in handled:', error?.code || error?.message || error);
      if (error?.code === 'auth/cancelled-popup-request') {
        if (auth.currentUser) {
          return { user: auth.currentUser, accessToken: getCachedAccessToken() };
        }
        throw new Error('A sign-in request is already in progress.');
      }
      if (error?.code === 'auth/popup-blocked') {
        throw new Error('The sign-in popup was blocked by your browser.');
      }
      if (error?.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in window was closed before finishing.');
      }
      throw error;
    } finally {
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
};

export const signOutUser = async (): Promise<void> => {
  clearCachedAccessToken();
  await firebaseSignOut(auth);
};

export const isAuthError = (err: any) => {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('invalid credentials') ||
    msg.includes('invalid_grant') ||
    msg.includes('token expired') ||
    msg.includes('credentials not configured')
  );
};

export const fetchSharedTokenFromServer = async () => getCachedAccessToken();

export const withGoogleToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
  let token = getCachedAccessToken();
  if (!token && auth.currentUser) {
    try {
      const result = await googleSignIn(false);
      token = result.accessToken;
    } catch {}
  }
  return await fn(token || '');
};
