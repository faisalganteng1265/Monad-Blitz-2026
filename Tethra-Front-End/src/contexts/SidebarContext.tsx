'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
  isExpanded: boolean;
  isMobileOpen: boolean;
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-expanded');
    if (savedState !== null) {
      setIsExpanded(savedState === 'true');
    }
    setIsMounted(true);
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('sidebar-expanded', String(isExpanded));
    }
  }, [isExpanded, isMounted]);

  const toggleSidebar = () => {
    setIsExpanded(prev => !prev);
  };

  const openMobileSidebar = () => {
    setIsMobileOpen(true);
  };

  const closeMobileSidebar = () => {
    setIsMobileOpen(false);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(prev => !prev);
  };

  return (
    <SidebarContext.Provider value={{
      isExpanded,
      isMobileOpen,
      toggleSidebar,
      openMobileSidebar,
      closeMobileSidebar,
      toggleMobileSidebar
    }}>
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
