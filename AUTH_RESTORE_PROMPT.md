# Prompt to restore Google sign-in

Restore the single-account Google authentication gate in Mr. Contract CRM.

Repository: `johnluidadolfo2003-dotcom/mrcontract-crm-portal`

Requirements:
- Re-enable the first-screen Google sign-in gate in `src/components/UserGatekeeper.tsx`.
- Only allow a verified Google account whose email matches `CRM_INITIAL_ADMIN_EMAIL`.
- Keep unauthorized users signed out and show a clear error message.
- Preserve the moon icon in dark mode and sun icon in light mode.
- Do not restore profile switching, default users, local user caches, seed/reset logic, or browser-storage authentication.
- Keep Firestore as the permanent CRM data source and do not change existing CRM workflows.
- Confirm that unauthenticated users cannot access the application routes.

Use the existing Firebase helpers in `src/lib/firebase.ts` and the current `ADMIN_EMAIL` configuration pattern in `src/lib/userContext.tsx`. After implementing, run the TypeScript build/lint checks and verify the authorized and unauthorized Google-account flows.
