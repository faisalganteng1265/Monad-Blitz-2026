'use client';

import Image from 'next/image';
import {
  CandlestickChart,
  Vault,
  Copy,
  ChevronLeft,
  ChevronRight,
  Coins,
  List,
  Grid2x2Plus,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';

export interface NavItem {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
}

interface SidebarContentProps {
  navItems?: NavItem[];
  logoSrc?: string;
  logoAlt?: string;
  brandName?: string;
  showToggle?: boolean;
  showBaseBadge?: boolean;
  forceExpanded?: boolean; // Force expanded state (for mobile)
}

export default function SidebarContent({
  navItems = [
    { href: '/trade', icon: Grid2x2Plus, label: 'Tap to Trade' },
    { href: '/market', icon: CandlestickChart, label: 'Market' },
    { href: '/vaults', icon: Vault, label: 'Vaults' },
    { href: '/stake', icon: Coins, label: 'Stake' },
    { href: '/positions', icon: List, label: 'Positions' },
    { href: '/copy-trade', icon: Copy, label: 'Copy Trade' },
  ],
  logoSrc = '/tethra-logo.png',
  logoAlt = 'Tethra Logo',
  brandName = 'Tethra',
  showToggle = true,
  showBaseBadge = true,
  forceExpanded = false,
}: SidebarContentProps) {
  const pathname = usePathname();
  const { isExpanded: contextExpanded, toggleSidebar } = useSidebar();

  // Use forceExpanded on mobile, otherwise use context state
  const isExpanded = forceExpanded || contextExpanded;

  return (
    <aside
      className={`flex flex-col items-start bg-[#0D1017] text-gray-300 h-full pt-6 pb-3 relative w-full rounded-lg ${
        isExpanded ? 'px-3' : 'px-2'
      }`}
    >
      {showToggle && (
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex absolute -right-3 top-8 bg-[#0D1017] border border-gray-700/50 rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all duration-200 z-10 shadow-lg hover:cursor-pointer"
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      )}

      <a
        href="/trade"
        className={`flex items-center mb-8 w-full cursor-pointer hover:opacity-80 transition-opacity ${
          isExpanded ? 'space-x-3' : 'justify-center'
        }`}
      >
        <Image
          src={logoSrc}
          alt={logoAlt}
          width={40}
          height={40}
          className="rounded-lg"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        {isExpanded && (
          <span className="text-2xl font-bold text-white tracking-tight whitespace-nowrap">
            {brandName}
          </span>
        )}
      </a>

      {/* Navigation */}
      <nav className="flex flex-col space-y-1 flex-1 w-full">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg transition-all duration-200 cursor-pointer group relative ${
                isExpanded ? 'space-x-3 px-3 py-3' : 'justify-center py-3'
              } ${
                isActive
                  ? 'bg-blue-300/15 text-blue-300'
                  : 'text-gray-400 hover:bg-gray-800/40 hover:text-white'
              }`}
              title={!isExpanded ? item.label : ''}
            >
              <Icon
                className={`transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'group-hover:scale-105'
                } ${isExpanded ? 'w-5 h-5' : 'w-5 h-5'}`}
              />
              {isExpanded && (
                <span className="text-sm font-semibold whitespace-nowrap">{item.label}</span>
              )}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg border border-gray-700">
                  {item.label}
                </div>
              )}
            </a>
          );
        })}
      </nav>

      {/* Built on Base Badge */}
      {showBaseBadge && (
        <div className="mt-auto w-full">
          <div
            className={`flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-lg hover:shadow-blue-300/20 transition-all duration-300 cursor-pointer ${
              isExpanded ? 'justify-center px-3 py-2.5' : 'justify-center p-2.5'
            }`}
          >
            <Image
              src="/icons/base.png"
              alt="Base Logo"
              width={18}
              height={18}
              className="rounded-full"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            {isExpanded && (
              <span className="text-xs font-bold text-white tracking-wide whitespace-nowrap">
                Build on Base
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
