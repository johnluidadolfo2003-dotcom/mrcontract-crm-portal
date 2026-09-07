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
googleProvider.setCustomParameters({ prompt: 'select_account' });

let activeSignInPromise: Promise<{ user: User; accessToken: string | null }> | null = null;

export const initAuth = (
 onAuthSuccess?: (user: any) => void,
 onAuthFailure?: () => void
) => {
 const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
 if (user) {
 if (onAuthSuccess) onAuthSuccess(user);
 } else {
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
 return { user: result.user, accessToken: null };
 } catch (error: any) {
 console.warn('Sign in handled:', error?.code || error?.message || error);
 if (error?.code === 'auth/cancelled-popup-request') {
 if (auth.currentUser) {
 return { user: auth.currentUser, accessToken: null };
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
 await firebaseSignOut(auth);
};

// Compatibility stubs for legacy token functions (calendar & sheets now handled server-side)
export const getCachedAccessToken = () => null;
export const clearCachedAccessToken = () => {};
export const isAuthError = (err: any) => false;
export const fetchSharedTokenFromServer = async () => null;
export const withGoogleToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
 return await fn('');
};

