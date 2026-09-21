import React from 'react';

/**
 * Temporary access mode: Google sign-in is intentionally disabled.
 * Theme state and the single theme toggle are owned by MainLayout so the
 * application has one consistent light/dark-mode source of truth.
 */
export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};
