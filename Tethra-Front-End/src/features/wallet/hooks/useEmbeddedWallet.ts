/**
 * Hook to get Privy embedded wallet address
 */

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useMemo } from 'react';

interface EmbeddedWalletAccount {
  address: string;
  id?: string;
  type?: string;
  imported?: boolean;
  walletClientType?: string;
  connectorType?: string;
}

export function useEmbeddedWallet() {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = useMemo(() => {
    const walletFromWallets = wallets.find(
      (wallet) => wallet.walletClientType === 'privy' || wallet.connectorType === 'embedded',
    );

    if (walletFromWallets) {
      return walletFromWallets as EmbeddedWalletAccount;
    }

    if (!user?.linkedAccounts) return null;

    const linkedWallets = user.linkedAccounts.filter(
      (account: unknown) => {
        const acc = account as { type: string; imported: boolean; id?: string };
        return acc.type === 'wallet' && acc.imported === false && acc.id !== undefined;
      }
    ) as EmbeddedWalletAccount[];

    return linkedWallets?.[0] || null;
  }, [user, wallets]);

  return {
    address: embeddedWallet?.address as `0x${string}` | undefined,
    hasEmbeddedWallet: !!embeddedWallet,
    embeddedWallet,
  };
}
