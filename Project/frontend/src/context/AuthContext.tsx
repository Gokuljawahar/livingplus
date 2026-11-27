import React from 'react';

/**
 * Legacy wrapper preserved for backward compatibility with tests and routes.
 * Auth session reactivity is powered by Zustand (`useAuthStore`) without React Context re-render trees.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
