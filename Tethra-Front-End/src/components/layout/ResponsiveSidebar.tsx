'use client';

import React, { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';

interface ResponsiveSidebarProps {
  children: ReactNode;
  className?: string;
}

export default function ResponsiveSidebar({ children, className = '' }: ResponsiveSidebarProps) {
  const { isExpanded, isMobileOpen, closeMobileSidebar } = useSidebar();

  return (
    <>
      <div
        className={`hidden lg:flex shrink-0 transition-all duration-300 flex-col ${className}`}
        style={{
          width: isExpanded ? '16vw' : '5vw',
          minWidth: isExpanded ? '120px' : '50px',
          maxWidth: isExpanded ? '200px' : '80px',
        }}
      >
        {children}
      </div>

      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 transition-opacity"
            onClick={closeMobileSidebar}
            aria-label="Close sidebar"
          />

          {/* Sidebar Panel */}
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-[#0B1017] transform transition-transform duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={closeMobileSidebar}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors z-10"
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>

            {/* Sidebar Content - Force expanded on mobile */}
            <div className="w-full">
              {React.Children.map(children, (child) =>
                React.isValidElement(child)
                  ? React.cloneElement(child, { forceExpanded: true } as any)
                  : child,
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
