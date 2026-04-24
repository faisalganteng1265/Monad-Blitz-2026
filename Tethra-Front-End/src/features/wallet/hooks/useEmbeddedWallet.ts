import { useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useMemo } from 'react';

/**
 * Returns the currently active wallet address.
 * Prefers the wagmi connected account; falls back to the first
 * Privy-linked wallet so every consumer gets the real address.
 */
export function useEmbeddedWallet() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const { wallets } = useWallets();

  const address = useMemo<`0x${string}` | undefined>(() => {
    if (wagmiAddress) return wagmiAddress;
    const first = wallets[0];
    return first?.address as `0x${string}` | undefined;
  }, [wagmiAddress, wallets]);

  return {
    address,
    hasEmbeddedWallet: isConnected || wallets.length > 0,
    embeddedWallet: address ? { address } : null,
  };
}
