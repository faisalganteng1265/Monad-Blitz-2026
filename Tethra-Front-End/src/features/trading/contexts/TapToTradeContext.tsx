'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useSessionKey } from '@/features/wallet/hooks/useSessionKey';

type TradeMode = 'one-tap-profit';

interface TapToTradeContextType {
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;

  tradeMode: TradeMode;

  isBinaryTradingEnabled: boolean;
  setIsBinaryTradingEnabled: (enabled: boolean) => void;

  isPrivateMode: boolean;
  setIsPrivateMode: (enabled: boolean) => void;

  betAmount: string;
  setBetAmount: (amount: string) => void;

  sessionKey: any | null;
  sessionTimeRemaining: number;
  signWithSession: (messageHash: `0x${string}`) => Promise<string | null>;
  createSession: (
    userAddress: string,
    walletClient: any,
    durationMs?: number,
  ) => Promise<any | null>;

  isLoading: boolean;
  error: string | null;
}

const TapToTradeContext = createContext<TapToTradeContextType | undefined>(undefined);

export const TapToTradeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [betAmount, setBetAmount] = useState('10');
  const [isBinaryTradingEnabled, setIsBinaryTradingEnabled] = useState(false);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const { sessionKey, createSession, signWithSession, getTimeRemaining } = useSessionKey();

  return (
    <TapToTradeContext.Provider
      value={{
        isEnabled,
        setIsEnabled,
        tradeMode: 'one-tap-profit',
        betAmount,
        setBetAmount,
        isBinaryTradingEnabled,
        setIsBinaryTradingEnabled,
        isPrivateMode,
        setIsPrivateMode,
        sessionKey,
        sessionTimeRemaining: getTimeRemaining(),
        signWithSession,
        createSession,
        isLoading,
        error,
      }}
    >
      {children}
    </TapToTradeContext.Provider>
  );
};

export const useTapToTrade = () => {
  const context = useContext(TapToTradeContext);
  if (context === undefined) {
    throw new Error('useTapToTrade must be used within a TapToTradeProvider');
  }
  return context;
};
