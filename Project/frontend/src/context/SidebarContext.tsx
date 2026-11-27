import React from 'react';

/**
 * Legacy wrapper preserved for backward compatibility with layout components.
 * Sidebar state is now managed via Zustand in `./sidebar` without React Context overhead.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
