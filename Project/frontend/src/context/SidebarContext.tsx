import React, { useState } from 'react';
import { SidebarContext, type SectionNavItem } from './sidebar';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sectionNav, setSectionNav] = useState<SectionNavItem[] | null>(null);

  const toggle = () => setIsOpen((prev) => !prev);
  const close = () => setIsOpen(false);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, sectionNav, setSectionNav }}>
      {children}
    </SidebarContext.Provider>
  );
}
