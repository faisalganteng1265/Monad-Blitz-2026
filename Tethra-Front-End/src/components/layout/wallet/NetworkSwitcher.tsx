/* eslint-disable @next/next/no-img-element */
'use client';

import { Button } from '@/components/ui/button';
import React from 'react';

export const NetworkSwitcher: React.FC = () => {
  return (
    <div className="relative group ml-3">
      <Button
        className="flex items-center justify-center w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
        title="Sepolia Base"
      >
        <img
          src="data:image/svg+xml,%3Csvg width='111' height='111' viewBox='0 0 111 111' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z' fill='%230052FF'/%3E%3C/svg%3E"
          alt="Base"
          className="w-6 h-6"
        />
      </Button>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
        Sepolia Base
      </div>
    </div>
  );
};
