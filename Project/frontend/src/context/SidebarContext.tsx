import React, { createContext, useContext, useState, type ComponentType } from 'react';

interface SectionNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
}

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  sectionNav: SectionNavItem[] | null;
  setSectionNav: (nav: SectionNavItem[] | null) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

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

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
