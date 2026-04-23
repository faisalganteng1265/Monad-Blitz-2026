'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useGridTrading as useGridTradingUI } from '@/features/trading/hooks/useGridTradingUI';

type GridTradingContextType = ReturnType<typeof useGridTradingUI>;

const GridTradingContext = createContext<GridTradingContextType | null>(null);

export const GridTradingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const gridTrading = useGridTradingUI({ currentPrice: 0, interval: '60' });

  return <GridTradingContext.Provider value={gridTrading}>{children}</GridTradingContext.Provider>;
};

export const useGridTradingContext = (): GridTradingContextType => {
  const context = useContext(GridTradingContext);
  if (!context) {
    throw new Error('useGridTradingContext must be used within GridTradingProvider');
  }
  return context;
};
