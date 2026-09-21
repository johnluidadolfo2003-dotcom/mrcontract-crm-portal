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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || undefined);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
googleProvider.setCustomParameters({ prompt: 'select_account' });

let cachedGoogleAccessToken: string | null = null;
const ACCESS_TOKEN_STORAGE_KEY = 'mrcontract_google_access_token';

export const getCachedAccessToken = (): string | null => {
  if (cachedGoogleAccessToken) return cachedGoogleAccessToken;
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      if (stored) {
        cachedGoogleAccessToken = stored;
        return stored;
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
      } else {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
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
      const result = await signInWithPopup(auth, googleProvider);
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
