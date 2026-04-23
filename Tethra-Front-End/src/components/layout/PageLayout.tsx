'use client';

import React, { ReactNode } from 'react';
import ResponsiveSidebar from '@/components/layout/ResponsiveSidebar';
import SidebarContent from '@/components/layout/SidebarContent';
import MobileHeader from '@/components/layout/MobileHeader';
import Navbar from '@/components/layout/Navbar';
import WalletConnectButton from '@/components/layout/WalletConnectButton';

interface PageLayoutProps {
  children: ReactNode;

  navbar?: {
    title?: string;
    subtitle?: string;
    leftContent?: ReactNode;
    centerContent?: ReactNode;
    rightContent?: ReactNode;
    showWalletButton?: boolean;
    variant?: 'default' | 'transparent' | 'gradient';
  };

  mobileHeader?: {
    rightContent?: ReactNode;
    logoSrc?: string;
    logoAlt?: string;
  };

  showNavbar?: boolean;
  showSidebar?: boolean;
  showMobileHeader?: boolean;
  className?: string;
  contentClassName?: string;
  mobileHeaderContent?: ReactNode;
  disableMobileHeaderContent?: boolean;
}

export default function PageLayout({
  children,
  navbar,
  mobileHeader,
  showNavbar = true,
  showSidebar = true,
  showMobileHeader = true,
  className = '',
  contentClassName = '',
  mobileHeaderContent,
  disableMobileHeaderContent = false,
}: PageLayoutProps) {
  return (
    <main className={`min-h-screen bg-black text-white p-2 ${className}`}>
      {/* Mobile Header - Only visible on mobile */}
      {showMobileHeader && (
        <MobileHeader
          rightContent={mobileHeader?.rightContent || <WalletConnectButton />}
          logoSrc={mobileHeader?.logoSrc}
          logoAlt={mobileHeader?.logoAlt}
        />
      )}

      <div className="flex w-full h-screen gap-2">
        {/* Sidebar - Responsive */}
        {showSidebar && (
          <ResponsiveSidebar>
            <SidebarContent />
          </ResponsiveSidebar>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto lg:p-0 p-2 flex flex-col gap-2">
          {/* Desktop Navbar - Only visible on desktop */}
          {showNavbar && navbar && (
            <Navbar
              title={navbar.title}
              subtitle={navbar.subtitle}
              leftContent={navbar.leftContent}
              centerContent={navbar.centerContent}
              rightContent={navbar.rightContent}
              showWalletButton={navbar.showWalletButton}
              variant={navbar.variant}
            />
          )}

          {/* Content Area with scroll */}
          <div className={`flex-1 overflow-y-auto lg:p-6 p-4 ${contentClassName}`}>
            {/* Mobile Header Content (title/subtitle for mobile) */}
            {!disableMobileHeaderContent && mobileHeaderContent ? (
              <div className="mb-6 lg:hidden">{mobileHeaderContent}</div>
            ) : !disableMobileHeaderContent && navbar?.title ? (
              <div className="mb-6 lg:hidden">
                <h1 className="text-3xl font-bold mb-2">{navbar.title}</h1>
                {navbar.subtitle && <p className="text-gray-400 text-sm">{navbar.subtitle}</p>}
              </div>
            ) : null}

            {/* Page Content */}
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
