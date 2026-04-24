/* eslint-disable @next/next/no-img-element */
'use client';

import { Button } from '@/components/ui/button';
import React from 'react';

export const NetworkSwitcher: React.FC = () => {
  return (
    <div className="relative group ml-3">
      <Button
        className="flex items-center justify-center w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
        title="Monad Testnet"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="12" fill="#836EF9"/>
          <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">M</text>
        </svg>
      </Button>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
        Monad Testnet
      </div>
    </div>
  );
};
