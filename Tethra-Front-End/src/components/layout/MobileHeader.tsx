'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import { useSidebar } from '@/contexts/SidebarContext';

interface MobileHeaderProps {
  logoSrc?: string;
  logoAlt?: string;
  rightContent?: React.ReactNode;
  className?: string;
}

export default function MobileHeader({
  logoSrc = '/tethra-logo.png',
  logoAlt = 'Tethra',
  rightContent,
  className = '',
}: MobileHeaderProps) {
  const { toggleMobileSidebar } = useSidebar();

  return (
    <div
      className={`lg:hidden flex items-center justify-between p-3 bg-[#0B1017] flex-shrink-0 rounded-lg mb-2 ${className}`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobileSidebar}
          className="p-2 hover:bg-[#1A2332] rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={24} />
        </button>
        <Image
          src={logoSrc}
          alt={logoAlt}
          width={50}
          height={50}
          className="w-12 h-12"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>

      {/* Right: Custom Content */}
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
}
