import type { ComponentType } from 'react';
import { create } from 'zustand';

export interface SectionNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
  /** Optional section heading; consecutive items with the same group sit under it. */
  group?: string;
}

export interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  sectionNav: SectionNavItem[] | null;
  setSectionNav: (nav: SectionNavItem[] | null) => void;
}

export const useSidebarStore = create<SidebarContextType>((set) => ({
  isOpen: false,
  sectionNav: null,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
  setSectionNav: (sectionNav) => set({ sectionNav })
}));

export function useSidebar(): SidebarContextType {
  return useSidebarStore();
}

export function _resetSidebarStoreForTests(): void {
  useSidebarStore.setState({ isOpen: false, sectionNav: null });
}
