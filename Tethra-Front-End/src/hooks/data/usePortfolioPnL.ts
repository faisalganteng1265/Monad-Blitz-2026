'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits } from 'viem';
import { monadTestnet } from '@/config/chains';
import { USDC_ADDRESS, USDC_DECIMALS } from '@/config/contracts';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export const usePortfolioPnL = () => {
  const { authenticated, user } = usePrivy();
  const { address } = useEmbeddedWallet();
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const initialBalanceRef = useRef<number | null>(null);

  const fetchBalance = async (addr: string): Promise<number | null> => {
    try {
      const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(),
      });
      const raw = (await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [
          {
            constant: true,
            inputs: [{ name: '_owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            type: 'function',
          },
        ],
        functionName: 'balanceOf',
        args: [addr as `0x${string}`],
      })) as bigint;
      return parseFloat(formatUnits(raw, USDC_DECIMALS));
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!authenticated || !user || !address) return;

    const run = async () => {
      setIsLoading(true);
      const balance = await fetchBalance(address);
      if (balance !== null) {
        if (initialBalanceRef.current === null) {
          initialBalanceRef.current = balance;
        }
        setCurrentBalance(balance);
      }
      setIsLoading(false);
    };

    run();

    // Refresh every 5s
    const id = setInterval(run, 5000);
    return () => clearInterval(id);
  }, [authenticated, user, address]);

  // Listen for manual refresh events
  useEffect(() => {
    if (!address) return;
    const handler = async () => {
      const balance = await fetchBalance(address);
      if (balance !== null) setCurrentBalance(balance);
    };
    window.addEventListener('tethra:refreshBalance', handler);
    return () => window.removeEventListener('tethra:refreshBalance', handler);
  }, [address]);

  const initial = initialBalanceRef.current;
  const pnlDollar =
    currentBalance !== null && initial !== null ? currentBalance - initial : null;
  const pnlPercent =
    pnlDollar !== null && initial !== null && initial !== 0
      ? (pnlDollar / initial) * 100
      : null;

  return {
    currentBalance,
    isLoading,
    pnlDollar,
    pnlPercent,
  };
};
