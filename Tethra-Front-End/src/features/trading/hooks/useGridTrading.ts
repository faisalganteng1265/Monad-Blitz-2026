import { useState } from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export interface GridConfig {
  asset: string;
  margin: string;
  leverage: number;
  timeframe: number; // in seconds (60 = 1m, 300 = 5m, etc)
  gridSizeX: number; // candles per cell
  gridSizeYPercent: number; // price range per cell in basis points (50 = 0.5%)
}

export interface GridSession {
  id: string;
  trader: string;
  symbol: string;
  marginTotal: string;
  leverage: number;
  timeframeSeconds: number;
  gridSizeX: number;
  gridSizeYPercent: number;
  referenceTime: number;
  referencePrice: string;
  isActive: boolean;
  createdAt: number;
}

export function useGridTrading() {
  const { address } = useEmbeddedWallet();
  const [isGridMode, setIsGridMode] = useState(false);
  const [gridConfig, setGridConfig] = useState<GridConfig | null>(null);
  const [gridSession, setGridSession] = useState<GridSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Enable Tap-to-Trade mode
   * Creates grid session in backend
   */
  const enableTapToTrade = async (
    config: GridConfig,
    currentPrice: number
  ): Promise<GridSession | null> => {
    if (!address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convert price to 8 decimals (contract format)
      const priceWith8Decimals = Math.round(currentPrice * 100000000).toString();

      // Convert margin to base units (6 decimals for USDC)
      const marginInBaseUnits = (parseFloat(config.margin) * 1000000).toString();

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/grid/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader: address,
          symbol: config.asset,
          marginTotal: marginInBaseUnits,
          leverage: config.leverage,
          timeframeSeconds: config.timeframe,
          gridSizeX: config.gridSizeX,
          gridSizeYPercent: config.gridSizeYPercent,
          referenceTime: Math.floor(Date.now() / 1000),
          referencePrice: priceWith8Decimals,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create grid session');
      }

      const session = result.data as GridSession;

      setGridSession(session);
      setGridConfig(config);
      setIsGridMode(true);

      return session;
    } catch (err: any) {
      setError(err.message || 'Failed to enable tap-to-trade');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Disable Tap-to-Trade mode
   * Cancels grid session
   */
  const disableTapToTrade = async (): Promise<boolean> => {
    if (!gridSession || !address) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/grid/cancel-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gridId: gridSession.id,
          trader: address,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel grid session');
      }

      setGridSession(null);
      setGridConfig(null);
      setIsGridMode(false);

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to disable tap-to-trade');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isGridMode,
    gridConfig,
    gridSession,
    isLoading,
    error,
    enableTapToTrade,
    disableTapToTrade,
  };
}
