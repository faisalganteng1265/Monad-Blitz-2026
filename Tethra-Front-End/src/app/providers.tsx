'use client';

import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { baseSepolia } from 'wagmi/chains';
import { Toaster } from '@/components/ui/sonner';
import { TPSLProvider } from '@/contexts/TPSLContext';

export const config = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmghox4fe01ijib0ccdcmw7j5'}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
          showWalletLoginFirst: true,
          walletList: [
            'base_account',
            'detected_ethereum_wallets',
            'metamask',
            'coinbase_wallet',
            'wallet_connect',
          ],
        },
        loginMethods: ['email', 'google', 'wallet'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <TPSLProvider>
            <Toaster />
            {children}
          </TPSLProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
