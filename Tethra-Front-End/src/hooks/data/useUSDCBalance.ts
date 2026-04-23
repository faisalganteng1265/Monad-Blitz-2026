import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import { USDC_ADDRESS, USDC_DECIMALS } from '@/config/contracts';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

/**
 * Custom hook to fetch USDC balance from the embedded wallet
 * Uses the same logic as WalletConnectButton to ensure consistency
 */
export const useUSDCBalance = () => {
  const { authenticated, user } = usePrivy();
  const { address } = useEmbeddedWallet();
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  useEffect(() => {
    const fetchUsdcBalance = async () => {
      if (!authenticated || !user) {
        setUsdcBalance('0.00');
        return;
      }

      if (!address) {
        setUsdcBalance('0.00');
        return;
      }

      setIsLoadingBalance(true);
      try {
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(),
        });

        const balance = (await publicClient.readContract({
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
          args: [address as `0x${string}`],
        })) as bigint;

        // Format USDC balance using configured decimals
        const formattedBalance = formatUnits(balance, USDC_DECIMALS);
        setUsdcBalance(parseFloat(formattedBalance).toFixed(2));
      } catch (error) {
        setUsdcBalance('0.00');
      } finally {
        setIsLoadingBalance(false);
      }
    };

    if (authenticated && user) {
      fetchUsdcBalance();

      // Refresh balance every 5 seconds to keep it in sync
      const interval = setInterval(fetchUsdcBalance, 5000);
      return () => clearInterval(interval);
    }
  }, [authenticated, user, address]);

  return { usdcBalance, isLoadingBalance };
};
