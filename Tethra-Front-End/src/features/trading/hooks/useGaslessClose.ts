/**
 * HACKATHON MODE: Gasless close position via backend
 * Backend relayer pays gas, no user signature needed
 */

import { useState, useCallback } from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';
import { toast } from 'sonner';
import { SignedPriceData } from '@/lib/priceApi';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface GaslessCloseParams {
  positionId: bigint;
  symbol: string;
  signedPrice?: SignedPriceData;
}

export function useGaslessClose() {
  const { address } = useEmbeddedWallet();
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>();
  const [error, setError] = useState<Error | null>(null);

  const closePosition = useCallback(
    async (params: GaslessCloseParams) => {
      try {
        setIsPending(true);
        setError(null);
        setTxHash(undefined);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Call backend endpoint
        const response = await fetch(`${BACKEND_URL}/api/relay/close-position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userAddress: address,
            positionId: params.positionId.toString(),
            symbol: params.symbol,
            signedPrice: params.signedPrice,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || result.message || 'Failed to close position');
        }

        const hash = result.data.txHash;
        setTxHash(hash);

        toast.success(`Position closed! TX: ${hash.slice(0, 10)}...`, {
          duration: 5000,
        });

        return hash;
      } catch (err) {
        console.error('❌ Error closing position gaslessly:', err);
        setError(err as Error);

        const errorMsg = (err as Error).message || 'Unknown error';
        toast.error(`Failed to close: ${errorMsg}`, {
          duration: 7000,
        });

        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address],
  );

  return {
    closePosition,
    isPending,
    txHash,
    error,
  };
}
