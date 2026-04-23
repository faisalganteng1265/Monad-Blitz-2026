'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BACKEND_API_URL } from '@/config/contracts';

export interface TPSLConfig {
  positionId: number;
  trader: string;
  symbol: string;
  isLong: boolean;
  entryPrice: string;
  takeProfit?: string;
  stopLoss?: string;
  createdAt: number;
  updatedAt: number;
}

interface TPSLContextType {
  configs: Record<number, TPSLConfig>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  getConfig: (positionId: number) => TPSLConfig | null;
}

const TPSLContext = createContext<TPSLContextType | undefined>(undefined);

export function TPSLProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<Record<number, TPSLConfig>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const fetchAll = async () => {
    // Prevent rapid refetches (debounce)
    if (Date.now() - lastFetch < 1000) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/tpsl/all`);
      const data = await response.json();

      if (response.ok && data.success && Array.isArray(data.data)) {
        // Convert array to map for O(1) lookup
        const configMap: Record<number, TPSLConfig> = {};
        data.data.forEach((config: TPSLConfig) => {
          configMap[config.positionId] = config;
        });
        setConfigs(configMap);
        setLastFetch(Date.now());
      }
    } catch (err) {
      console.error('Error fetching all TP/SL:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, []);

  // Listen to tpsl-updated events for real-time updates
  useEffect(() => {
    const handleTPSLUpdate = () => {
      fetchAll();
    };

    window.addEventListener('tpsl-updated', handleTPSLUpdate);
    return () => window.removeEventListener('tpsl-updated', handleTPSLUpdate);
  }, []);

  // Auto-refresh every 5 seconds to catch new TP/SL configs
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getConfig = (positionId: number): TPSLConfig | null => {
    return configs[positionId] || null;
  };

  return (
    <TPSLContext.Provider value={{ configs, isLoading, refresh: fetchAll, getConfig }}>
      {children}
    </TPSLContext.Provider>
  );
}

export function useTPSLContext() {
  const context = useContext(TPSLContext);
  if (context === undefined) {
    throw new Error('useTPSLContext must be used within a TPSLProvider');
  }
  return context;
}
