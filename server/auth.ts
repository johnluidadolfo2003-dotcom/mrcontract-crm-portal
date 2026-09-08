import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

let adminApp: App | null = null;
let adminAuthInstance: Auth | any = null;
let adminDbInstance: Firestore | any = null;
let authConfigError: string | null = null;

// Initialize Firebase Admin SDK in fail-closed mode
function initializeFirebaseAdmin(): void {
  if (getApps().length) {
    adminApp = getApps()[0];
    adminAuthInstance = getAuth(adminApp);
    adminDbInstance = getFirestore(adminApp);
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID.trim() : '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ? process.env.FIREBASE_CLIENT_EMAIL.trim() : '';
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.trim() : '';

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (projectId && clientEmail && privateKey) {
    try {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      adminAuthInstance = getAuth(adminApp);
      adminDbInstance = getFirestore(adminApp);
      console.log('[Auth] Initialized Firebase Admin via environment credentials');
    } catch (err: any) {
      authConfigError = 'Failed to initialize Firebase Admin with provided credentials';
      console.error('[Auth] Failed to initialize Firebase Admin:', err?.message || err);
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In production, MUST fail closed if credentials missing
    authConfigError = 'Firebase Admin credentials missing in production environment';
    console.error('[Auth] Missing required Firebase Admin environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
  } else {
    // Development / Local environment fallback check
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.projectId) {
          adminApp = initializeApp({ projectId: config.projectId });
          adminAuthInstance = getAuth(adminApp);
          adminDbInstance = getFirestore(adminApp);
          console.log('[Auth] Initialized Firebase Admin via local config file');
        } else {
          authConfigError = 'Invalid local config file';
        }
      } catch (err: any) {
        authConfigError = 'Failed to parse local config file';
      }
    } else {
      authConfigError = 'Firebase credentials not configured';
    }
  }
}

initializeFirebaseAdmin();

export function setFirebaseAdminInstancesForTesting(authMock?: any, dbMock?: any): void {
  if (authMock !== undefined) adminAuthInstance = authMock;
  if (dbMock !== undefined) adminDbInstance = dbMock;
}

export function getAdminAuth(): Auth {
  if (!adminAuthInstance) {
    throw new Error('Authentication service is not properly configured on the server');
  }
  return adminAuthInstance;
}

export function getAdminDb(): Firestore {
  if (!adminDbInstance) {
    throw new Error('Database service is not properly configured on the server');
  }
  return adminDbInstance;
}

export const adminAuth = {
  verifySessionCookie: (cookie: string, checkRevoked?: boolean) => getAdminAuth().verifySessionCookie(cookie, checkRevoked),
  verifyIdToken: (token: string, checkRevoked?: boolean) => getAdminAuth().verifyIdToken(token, checkRevoked),
  createSessionCookie: (idToken: string, options: { expiresIn: number }) => getAdminAuth().createSessionCookie(idToken, options),
};

export const adminDb = {
  collection: (name: string) => getAdminDb().collection(name),
  runTransaction: <T>(updateFunction: (transaction: any) => Promise<T>) => getAdminDb().runTransaction(updateFunction),
};

/**
 * Counts total active users with role 'admin'
 */
export async function countActiveAdmins(): Promise<number> {
  try {
    const snap = await adminDb
      .collection('users')
      .where('role', '==', 'admin')
      .where('active', '==', true)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  createdBy?: string;
  uid?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Same-Origin validation helper
 */
export function validateSameOrigin(req: Request): boolean {
  // Allow test bypass flag ONLY during automated tests
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-allow-origin'] === 'true') {
    return true;
  }

  const originHeader = (req.headers.origin || req.headers.referer) as string | undefined;
  const hostHeader = (req.headers.host || req.get?.('host')) as string | undefined;

  if (!originHeader || !hostHeader) {
    return false;
  }

  try {
    const parsedOrigin = new URL(originHeader);
    const originHost = parsedOrigin.host.toLowerCase();
    const cleanHost = hostHeader.toLowerCase();

    // Direct host match (host:port or host)
    if (originHost === cleanHost) {
      return true;
    }

    // Match without port when behind proxy
    if (parsedOrigin.hostname.toLowerCase() === cleanHost.split(':')[0]) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Reusable Same-Origin validation middleware for CSRF protection
 */
export function sameOriginMiddleware(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    if (!validateSameOrigin(req)) {
      return res.status(403).json({ error: 'Forbidden: Invalid or mismatched request origin' });
    }
  }
  next();
}

/**
 * Synchronizes the security/soleAccess document in Firestore to reflect CRM_INITIAL_ADMIN_EMAIL.
 * Firestore client rules reference this document to restrict reads/writes to the sole authorized user.
 */
export async function syncSoleAccessDocument(): Promise<void> {
  const rawEmail = process.env.CRM_INITIAL_ADMIN_EMAIL;
  if (!rawEmail || !rawEmail.trim()) {
    console.warn('[Auth] Cannot sync soleAccess document: CRM_INITIAL_ADMIN_EMAIL is not configured');
    return;
  }
  const normalizedEmail = rawEmail.trim().toLowerCase();
  try {
    const docRef = adminDb.collection('security').doc('soleAccess');
    await docRef.set(
      {
        email: normalizedEmail,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`[Auth] security/soleAccess document synced for sole account: ${normalizedEmail}`);
  } catch (err: any) {
    console.error('[Auth] Failed to sync security/soleAccess document:', err?.message || err);
  }
}

/**
 * Verifies or bootstraps the single authorized user from a Firebase Auth token payload.
 * Enforces strict CRM_INITIAL_ADMIN_EMAIL matching. All other accounts are rejected immediately.
 */
export async function syncOrCheckUser(idTokenUser: { email: string; name?: string; uid: string }): Promise<AuthenticatedUser | null> {
  if (!idTokenUser.email) return null;
  const normalizedEmail = idTokenUser.email.trim().toLowerCase();
  const rawInitialAdminEmail = process.env.CRM_INITIAL_ADMIN_EMAIL;

  if (!rawInitialAdminEmail || !rawInitialAdminEmail.trim()) {
    console.error('[Auth] CRM_INITIAL_ADMIN_EMAIL is not configured on the server');
    throw new Error('Server authentication configuration is incomplete: CRM_INITIAL_ADMIN_EMAIL missing');
  }

  const initialAdminEmail = rawInitialAdminEmail.trim().toLowerCase();
  if (normalizedEmail !== initialAdminEmail) {
    // Immediate rejection: Never authorize non-approved account regardless of existing Firestore documents
    return null;
  }

  // Ensure security/soleAccess document is synchronized
  await syncSoleAccessDocument();

  const userRef = adminDb.collection('users').doc(normalizedEmail);
  const now = new Date().toISOString();
  const cleanDisplayName = (idTokenUser.name || normalizedEmail.split('@')[0]).trim();

  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    const soleAdminUser: AuthenticatedUser = {
      id: normalizedEmail,
      email: normalizedEmail,
      displayName: cleanDisplayName,
      name: cleanDisplayName,
      role: 'admin',
      active: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      createdBy: 'system_bootstrap',
      uid: idTokenUser.uid,
    };
    await userRef.set(soleAdminUser);
    return soleAdminUser;
  }

  const userData = userDoc.data() as AuthenticatedUser;
  const updatedUser: AuthenticatedUser = {
    ...userData,
    id: normalizedEmail,
    email: normalizedEmail,
    displayName: cleanDisplayName || userData.displayName || normalizedEmail.split('@')[0],
    name: cleanDisplayName || userData.name || normalizedEmail.split('@')[0],
    role: 'admin',
    active: true,
    updatedAt: now,
    lastLoginAt: now,
    uid: idTokenUser.uid,
  };
  await userRef.set(updatedUser, { merge: true });
  return updatedUser;
}

/**
 * Express Middleware: Requires a valid Firebase session cookie or Bearer ID token,
 * accepts ONLY the sole approved user matching CRM_INITIAL_ADMIN_EMAIL, and attaches req.user.
 */
export async function requireAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const rawAdminEmail = process.env.CRM_INITIAL_ADMIN_EMAIL;
    if (!rawAdminEmail || !rawAdminEmail.trim()) {
      return res.status(500).json({ error: 'Server authentication configuration is incomplete: CRM_INITIAL_ADMIN_EMAIL missing' });
    }
    const configuredAdminEmail = rawAdminEmail.trim().toLowerCase();

    let sessionCookie = req.cookies?.__session;
    let authUser: AuthenticatedUser | null = null;

    if (sessionCookie) {
      try {
        const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
        if (decodedToken && decodedToken.email && decodedToken.email_verified === true) {
          const normalizedEmail = decodedToken.email.trim().toLowerCase();
          if (normalizedEmail === configuredAdminEmail) {
            const userDoc = await adminDb.collection('users').doc(normalizedEmail).get();
            const data = userDoc.exists ? (userDoc.data() as AuthenticatedUser) : null;
            authUser = {
              id: normalizedEmail,
              email: normalizedEmail,
              displayName: data?.displayName || data?.name || decodedToken.name || normalizedEmail.split('@')[0],
              name: data?.name || data?.displayName || decodedToken.name || normalizedEmail.split('@')[0],
              role: 'admin',
              active: true,
              uid: decodedToken.uid,
            };
          }
        }
      } catch (e) {
        // Expired or revoked session
      }
    }

    if (!authUser && req.headers.authorization?.startsWith('Bearer ')) {
      const idToken = req.headers.authorization.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken, true);
        if (decodedToken && decodedToken.email && decodedToken.email_verified === true) {
          const normalizedEmail = decodedToken.email.trim().toLowerCase();
          if (normalizedEmail === configuredAdminEmail) {
            const userDoc = await adminDb.collection('users').doc(normalizedEmail).get();
            const data = userDoc.exists ? (userDoc.data() as AuthenticatedUser) : null;
            authUser = {
              id: normalizedEmail,
              email: normalizedEmail,
              displayName: data?.displayName || data?.name || decodedToken.name || normalizedEmail.split('@')[0],
              name: data?.name || data?.displayName || decodedToken.name || normalizedEmail.split('@')[0],
              role: 'admin',
              active: true,
              uid: decodedToken.uid,
            };
          }
        }
      } catch (e) {
        // Invalid token
      }
    }

    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    req.user = authUser;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }
}

/**
 * Express Middleware: Requires Administrator role matching CRM_INITIAL_ADMIN_EMAIL
 */
export function requireAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const rawAdminEmail = process.env.CRM_INITIAL_ADMIN_EMAIL;
  const configuredAdminEmail = rawAdminEmail ? rawAdminEmail.trim().toLowerCase() : '';

  if (
    !req.user ||
    req.user.role !== 'admin' ||
    !configuredAdminEmail ||
    req.user.email.trim().toLowerCase() !== configuredAdminEmail
  ) {
    return res.status(403).json({ error: 'Forbidden: Administrator access required' });
  }
  next();
}
