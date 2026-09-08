import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import {
  syncOrCheckUser,
  requireAuthMiddleware,
  requireAdminMiddleware,
  sameOriginMiddleware,
  validateSameOrigin,
  setFirebaseAdminInstancesForTesting,
  AuthenticatedRequest,
  AuthenticatedUser,
} from './server/auth.ts';
import {
  validateWebhookSecret,
  validateThumbtackAuth,
  getBackendWebhookUrl,
  safeTimingCompare,
} from './server/webhookSecurity.ts';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.CRM_INITIAL_ADMIN_EMAIL = 'admin@mrcontract.com';
process.env.WEBHOOK_SECRET_KEY = 'test_webhook_secret_key_production_grade_987';
process.env.THUMBTACK_WEBHOOK_USERNAME = 'thumbtack_official_user';
process.env.THUMBTACK_WEBHOOK_PASSWORD = 'thumbtack_official_password_secure_456';
process.env.ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/12345/secret_target/';

// In-Memory Mock Implementations for Firebase Admin & Firestore
class InMemoryFirestore {
  data: Map<string, Map<string, any>> = new Map();

  collection(name: string) {
    if (!this.data.has(name)) {
      this.data.set(name, new Map());
    }
    const coll = this.data.get(name)!;

    return {
      doc: (id: string) => {
        return {
          id,
          get: async () => {
            const exists = coll.has(id);
            return {
              exists,
              id,
              data: () => (exists ? JSON.parse(JSON.stringify(coll.get(id))) : undefined),
            };
          },
          set: async (docData: any) => {
            coll.set(id, JSON.parse(JSON.stringify(docData)));
          },
          update: async (partialData: any) => {
            if (!coll.has(id)) throw new Error('Doc not found');
            const existing = coll.get(id);
            coll.set(id, { ...existing, ...JSON.parse(JSON.stringify(partialData)) });
          },
        };
      },
      where: (field: string, op: string, value: any) => {
        return {
          where: (f2: string, op2: string, v2: any) => ({
            get: async () => {
              const matches: any[] = [];
              for (const doc of coll.values()) {
                if (doc[field] === value && doc[f2] === v2) {
                  matches.push(doc);
                }
              }
              return { size: matches.length, docs: matches };
            },
          }),
          get: async () => {
            const matches: any[] = [];
            for (const doc of coll.values()) {
              if (doc[field] === value) {
                matches.push(doc);
              }
            }
            return { size: matches.length, docs: matches };
          },
        };
      },
    };
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const transaction = {
      get: async (docRef: any) => docRef.get(),
      set: async (docRef: any, data: any) => docRef.set(data),
      update: async (docRef: any, data: any) => docRef.update(data),
    };
    return updateFunction(transaction);
  }
}

class InMemoryAuth {
  async verifyIdToken(token: string, checkRevoked?: boolean) {
    if (token === 'valid_admin_token') {
      return { uid: 'uid_admin_1', email: 'admin@mrcontract.com', email_verified: true, name: 'Admin Boss' };
    }
    if (token === 'unverified_admin_token') {
      return { uid: 'uid_unverified', email: 'admin@mrcontract.com', email_verified: false, name: 'Unverified Admin' };
    }
    if (token === 'valid_staff_token') {
      return { uid: 'uid_staff_1', email: 'staff@mrcontract.com', email_verified: true, name: 'Staff Member' };
    }
    if (token === 'attacker_token') {
      return { uid: 'uid_attacker', email: 'attacker@evil.com', email_verified: true, name: 'Attacker' };
    }
    if (token === 'disabled_staff_token') {
      return { uid: 'uid_disabled', email: 'disabled@mrcontract.com', email_verified: true, name: 'Disabled User' };
    }
    throw new Error('Firebase ID Token is invalid or expired');
  }

  async verifySessionCookie(cookie: string, checkRevoked?: boolean) {
    if (cookie === 'valid_admin_cookie') {
      return { uid: 'uid_admin_1', email: 'admin@mrcontract.com', email_verified: true, name: 'Admin Boss' };
    }
    if (cookie === 'unverified_admin_cookie') {
      return { uid: 'uid_unverified', email: 'admin@mrcontract.com', email_verified: false, name: 'Unverified Admin' };
    }
    if (cookie === 'missing_verified_admin_cookie') {
      return { uid: 'uid_missing_verified', email: 'admin@mrcontract.com', name: 'Admin Missing Verified Flag' };
    }
    if (cookie === 'verified_different_email_cookie') {
      return { uid: 'uid_different', email: 'intruder@evil.com', email_verified: true, name: 'Intruder' };
    }
    if (cookie === 'valid_staff_cookie') {
      return { uid: 'uid_staff_1', email: 'staff@mrcontract.com', email_verified: true, name: 'Staff Member' };
    }
    if (cookie === 'disabled_staff_cookie') {
      return { uid: 'uid_disabled', email: 'disabled@mrcontract.com', email_verified: true, name: 'Disabled User' };
    }
    if (cookie === 'expired_revoked_cookie') {
      throw new Error('Firebase session cookie is invalid, expired, or revoked');
    }
    throw new Error('Firebase session cookie is invalid or expired');
  }

  async createSessionCookie(idToken: string, options: { expiresIn: number }) {
    return `session_${idToken}`;
  }
}

async function runRealSecurityTestSuite() {
  console.log('===============================================================');
  console.log('  RUNNING PRODUCTION-GRADE PHASE 1 SECURITY AUDIT TEST SUITE   ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      if (details) console.error('  Details:', details);
      failed++;
    }
  }

  // 1. Initialize isolated in-memory test mocks
  const mockDb = new InMemoryFirestore();
  const mockAuth = new InMemoryAuth();
  setFirebaseAdminInstancesForTesting(mockAuth, mockDb);

  console.log('\n--- 1. Testing User Bootstrap and Authentication (syncOrCheckUser) ---');

  // Test 1.1: Exact Initial Administrator First Login -> Bootstrapped as Admin
  const adminResult = await syncOrCheckUser({
    email: 'admin@mrcontract.com',
    name: 'Admin Boss',
    uid: 'uid_admin_1',
  });
  assert(
    adminResult !== null && adminResult.role === 'admin' && adminResult.active === true && adminResult.createdBy === 'system_bootstrap',
    'Exact Initial Admin (admin@mrcontract.com) bootstraps active admin account in Firestore'
  );

  // Test 1.2: Incorrect First User (Not invited, not initial admin) -> Rejected (null)
  const intruderResult = await syncOrCheckUser({
    email: 'intruder@evil.com',
    name: 'Intruder',
    uid: 'uid_intruder',
  });
  assert(
    intruderResult === null,
    'Uninvited first user (intruder@evil.com) is denied access (returns null)'
  );

  // Test 1.3: Missing initial-admin configuration -> Fails closed with Error
  const savedAdminEmail = process.env.CRM_INITIAL_ADMIN_EMAIL;
  delete process.env.CRM_INITIAL_ADMIN_EMAIL;
  let missingConfigThrew = false;
  try {
    await syncOrCheckUser({ email: 'admin@mrcontract.com', uid: 'uid_1' });
  } catch (err: any) {
    missingConfigThrew = true;
  }
  process.env.CRM_INITIAL_ADMIN_EMAIL = savedAdminEmail;
  assert(
    missingConfigThrew,
    'Missing CRM_INITIAL_ADMIN_EMAIL configuration fails closed (throws error)'
  );

  // Test 1.4: Legacy / Non-Admin User in Firestore -> Strictly Denied (Single-User Model)
  const usersColl = mockDb.collection('users');
  await usersColl.doc('staff@mrcontract.com').set({
    id: 'staff@mrcontract.com',
    email: 'staff@mrcontract.com',
    name: 'Staff Member',
    displayName: 'Staff Member',
    role: 'staff',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'admin@mrcontract.com',
  });

  const staffResult = await syncOrCheckUser({
    email: 'staff@mrcontract.com',
    name: 'Staff Member',
    uid: 'uid_staff_1',
  });
  assert(
    staffResult === null,
    'Non-admin user (staff@mrcontract.com) is strictly denied access under single-user model'
  );

  // Test 1.5: Disabled / Inactive User -> Access Denied
  await usersColl.doc('disabled@mrcontract.com').set({
    id: 'disabled@mrcontract.com',
    email: 'disabled@mrcontract.com',
    name: 'Disabled User',
    displayName: 'Disabled User',
    role: 'staff',
    active: false,
    createdAt: new Date().toISOString(),
    createdBy: 'admin@mrcontract.com',
  });

  const disabledResult = await syncOrCheckUser({
    email: 'disabled@mrcontract.com',
    name: 'Disabled User',
    uid: 'uid_disabled',
  });
  assert(
    disabledResult === null,
    'Disabled user (active: false) is strictly denied access'
  );

  console.log('\n--- 2. Testing Middleware (requireAuthMiddleware, requireAdminMiddleware) ---');

  // Test 2.1: requireAuthMiddleware rejects request with no credentials
  let authMiddlewareStatus = 0;
  let authMiddlewareError = '';
  const mockRes: any = {
    status: (code: number) => {
      authMiddlewareStatus = code;
      return {
        json: (data: any) => {
          authMiddlewareError = data.error;
        },
      };
    },
  };
  const mockReqNoAuth: any = { headers: {}, cookies: {} };
  let nextCalled = false;
  await requireAuthMiddleware(mockReqNoAuth, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects missing credentials with HTTP 401'
  );

  // Test 2.2: requireAuthMiddleware accepts valid session cookie for active verified admin
  nextCalled = false;
  const mockReqAdminCookie: any = {
    headers: {},
    cookies: { __session: 'valid_admin_cookie' },
  };
  await requireAuthMiddleware(mockReqAdminCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(
    nextCalled && mockReqAdminCookie.user?.role === 'admin' && mockReqAdminCookie.user?.email === 'admin@mrcontract.com',
    'requireAuthMiddleware attaches verified admin user to req.user for valid verified session cookie'
  );

  // Test 2.3: requireAuthMiddleware REJECTS session cookie with email_verified === false
  authMiddlewareStatus = 0;
  nextCalled = false;
  const mockReqUnverifiedCookie: any = {
    headers: {},
    cookies: { __session: 'unverified_admin_cookie' },
  };
  await requireAuthMiddleware(mockReqUnverifiedCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects session cookie with email_verified: false with HTTP 401'
  );

  // Test 2.4: requireAuthMiddleware REJECTS session cookie with email_verified missing
  authMiddlewareStatus = 0;
  nextCalled = false;
  const mockReqMissingVerifiedCookie: any = {
    headers: {},
    cookies: { __session: 'missing_verified_admin_cookie' },
  };
  await requireAuthMiddleware(mockReqMissingVerifiedCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects session cookie with missing email_verified with HTTP 401'
  );

  // Test 2.5: requireAuthMiddleware REJECTS session cookie with verified but different email
  authMiddlewareStatus = 0;
  nextCalled = false;
  const mockReqDifferentEmailCookie: any = {
    headers: {},
    cookies: { __session: 'verified_different_email_cookie' },
  };
  await requireAuthMiddleware(mockReqDifferentEmailCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects session cookie for unauthorized email (intruder@evil.com) with HTTP 401'
  );

  // Test 2.6: requireAuthMiddleware REJECTS expired or revoked session cookie
  authMiddlewareStatus = 0;
  nextCalled = false;
  const mockReqExpiredCookie: any = {
    headers: {},
    cookies: { __session: 'expired_revoked_cookie' },
  };
  await requireAuthMiddleware(mockReqExpiredCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects expired or revoked session cookie with HTTP 401'
  );

  // Test 2.7: requireAuthMiddleware accepts valid Bearer ID token for verified admin
  nextCalled = false;
  const mockReqBearerToken: any = {
    headers: { authorization: 'Bearer valid_admin_token' },
    cookies: {},
  };
  await requireAuthMiddleware(mockReqBearerToken, mockRes, () => {
    nextCalled = true;
  });
  assert(
    nextCalled && mockReqBearerToken.user?.role === 'admin' && mockReqBearerToken.user?.email === 'admin@mrcontract.com',
    'requireAuthMiddleware attaches verified admin user to req.user for valid Bearer ID token'
  );

  // Test 2.8: requireAuthMiddleware rejects Bearer ID token with unverified email
  authMiddlewareStatus = 0;
  nextCalled = false;
  const mockReqUnverifiedBearer: any = {
    headers: { authorization: 'Bearer unverified_admin_token' },
    cookies: {},
  };
  await requireAuthMiddleware(mockReqUnverifiedBearer, mockRes, () => {
    nextCalled = true;
  });
  assert(
    authMiddlewareStatus === 401 && !nextCalled,
    'requireAuthMiddleware rejects Bearer ID token with email_verified: false with HTTP 401'
  );

  // Test 2.9: requireAdminMiddleware allows admin user
  nextCalled = false;
  requireAdminMiddleware(mockReqAdminCookie, mockRes, () => {
    nextCalled = true;
  });
  assert(nextCalled, 'requireAdminMiddleware allows admin user to proceed');

  // Test 2.10: requireAdminMiddleware rejects staff user with 403
  let adminCheckStatus = 0;
  let adminCheckError = '';
  const mockResAdminCheck: any = {
    status: (code: number) => {
      adminCheckStatus = code;
      return {
        json: (data: any) => {
          adminCheckError = data.error;
        },
      };
    },
  };
  const mockReqStaffUser: any = {
    headers: {},
    user: { id: 'staff@mrcontract.com', email: 'staff@mrcontract.com', role: 'staff', active: true },
  };
  nextCalled = false;
  requireAdminMiddleware(mockReqStaffUser, mockResAdminCheck, () => {
    nextCalled = true;
  });
  assert(
    adminCheckStatus === 403 && !nextCalled,
    'requireAdminMiddleware rejects staff user with HTTP 403 Forbidden'
  );

  console.log('\n--- 3. Testing Same-Origin / CSRF Validation Middleware ---');

  // Test 3.1: Missing Origin & Referer headers
  const reqNoOrigin: any = { method: 'POST', headers: { host: 'app.mrcontract.com' }, get: () => 'app.mrcontract.com' };
  assert(
    validateSameOrigin(reqNoOrigin) === false,
    'validateSameOrigin rejects request with missing Origin and Referer'
  );

  // Test 3.2: Mismatched Origin (attacker domain)
  const reqAttackerOrigin: any = {
    method: 'POST',
    headers: { origin: 'https://evil-attacker.com', host: 'app.mrcontract.com' },
    get: (h: string) => (h === 'host' ? 'app.mrcontract.com' : undefined),
  };
  assert(
    validateSameOrigin(reqAttackerOrigin) === false,
    'validateSameOrigin rejects mismatched cross-origin domain (https://evil-attacker.com)'
  );

  // Test 3.3: Valid Matching Origin
  const reqValidOrigin: any = {
    method: 'POST',
    headers: { origin: 'https://app.mrcontract.com', host: 'app.mrcontract.com' },
    get: (h: string) => (h === 'host' ? 'app.mrcontract.com' : undefined),
  };
  assert(
    validateSameOrigin(reqValidOrigin) === true,
    'validateSameOrigin allows valid matching request origin'
  );

  // Test 3.4: sameOriginMiddleware rejects invalid origin on state-changing request
  let csrfStatus = 0;
  const mockResCsrf: any = {
    status: (code: number) => {
      csrfStatus = code;
      return { json: () => {} };
    },
  };
  nextCalled = false;
  sameOriginMiddleware(reqAttackerOrigin, mockResCsrf, () => {
    nextCalled = true;
  });
  assert(
    csrfStatus === 403 && !nextCalled,
    'sameOriginMiddleware returns HTTP 403 Forbidden for state-changing request with invalid origin'
  );

  console.log('\n--- 4. Testing Inbound Webhook Authentication & Strict Isolation ---');

  const webhookSecret = process.env.WEBHOOK_SECRET_KEY!;
  const ttUser = process.env.THUMBTACK_WEBHOOK_USERNAME!;
  const ttPass = process.env.THUMBTACK_WEBHOOK_PASSWORD!;

  // Test 4.1: Angi Webhook Secret Header Validation
  const reqAngiValid: any = { headers: { 'x-webhook-secret': webhookSecret } };
  assert(
    validateWebhookSecret(reqAngiValid) === true,
    'validateWebhookSecret accepts valid x-webhook-secret header'
  );

  // Test 4.2: Angi Webhook Secret Header Invalid
  const reqAngiInvalid: any = { headers: { 'x-webhook-secret': 'wrong_secret' } };
  assert(
    validateWebhookSecret(reqAngiInvalid) === false,
    'validateWebhookSecret rejects incorrect webhook secret'
  );

  // Test 4.3: Angi Webhook Missing Header
  const reqAngiMissing: any = { headers: {} };
  assert(
    validateWebhookSecret(reqAngiMissing) === false,
    'validateWebhookSecret rejects missing webhook secret header'
  );

  // Test 4.4: Thumbtack Basic Authentication Valid
  const validBasicAuth = 'Basic ' + Buffer.from(`${ttUser}:${ttPass}`).toString('base64');
  const reqThumbtackValid: any = { headers: { authorization: validBasicAuth } };
  assert(
    validateThumbtackAuth(reqThumbtackValid) === true,
    'validateThumbtackAuth accepts valid HTTP Basic Authentication credentials'
  );

  // Test 4.5: Thumbtack Basic Authentication Invalid
  const invalidBasicAuth = 'Basic ' + Buffer.from('baduser:badpass').toString('base64');
  const reqThumbtackInvalid: any = { headers: { authorization: invalidBasicAuth } };
  assert(
    validateThumbtackAuth(reqThumbtackInvalid) === false,
    'validateThumbtackAuth rejects invalid HTTP Basic Authentication credentials'
  );

  // Test 4.6: CRITICAL: Thumbtack REJECTS WEBHOOK_SECRET_KEY (Fallback Removed)
  const reqThumbtackWithWebhookSecret: any = {
    headers: {
      'x-webhook-secret': webhookSecret,
      authorization: `Bearer ${webhookSecret}`,
    },
  };
  assert(
    validateThumbtackAuth(reqThumbtackWithWebhookSecret) === false,
    'validateThumbtackAuth STRICTLY REJECTS WEBHOOK_SECRET_KEY (no secret fallback allowed)'
  );

  // Test 4.7: Thumbtack Fails Closed if Environment Variables are Missing
  const savedTtUser = process.env.THUMBTACK_WEBHOOK_USERNAME;
  delete process.env.THUMBTACK_WEBHOOK_USERNAME;
  assert(
    validateThumbtackAuth(reqThumbtackValid) === false,
    'validateThumbtackAuth fails closed if THUMBTACK_WEBHOOK_USERNAME is missing'
  );
  process.env.THUMBTACK_WEBHOOK_USERNAME = savedTtUser;

  console.log('\n--- 5. Testing Webhook URL Sanitization & Leakage Prevention ---');

  // Test 5.1: getBackendWebhookUrl resolves server environment variable
  const resolvedUrl = getBackendWebhookUrl();
  assert(
    resolvedUrl === process.env.ZAPIER_WEBHOOK_URL,
    'getBackendWebhookUrl resolves ZAPIER_WEBHOOK_URL server environment variable'
  );

  // Test 5.2: Safe timing comparison prevents timing side-channels
  assert(safeTimingCompare('secure_password_123', 'secure_password_123') === true, 'safeTimingCompare validates matching strings');
  assert(safeTimingCompare('secure_password_123', 'wrong_password_456') === false, 'safeTimingCompare rejects non-matching strings');
  assert(safeTimingCompare('short', 'much_longer_string') === false, 'safeTimingCompare rejects strings of different length');

  console.log(`\n===============================================================`);
  console.log(`PHASE 1 SECURITY AUDIT: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRealSecurityTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
