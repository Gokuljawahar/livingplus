import { createContext, useContext, type ComponentType } from 'react';

export interface SectionNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
}

export interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  sectionNav: SectionNavItem[] | null;
  setSectionNav: (nav: SectionNavItem[] | null) => void;
}

export const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
