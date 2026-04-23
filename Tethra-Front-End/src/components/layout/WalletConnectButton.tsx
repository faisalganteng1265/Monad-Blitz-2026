/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSwitchChain, useChainId } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { NetworkSwitcher } from '@/components/layout/wallet/NetworkSwitcher';
import { WalletDialogContent } from '@/components/layout/wallet/WalletDialogContent';
import { useWalletActions } from '@/hooks/wallet/useWalletActions';

const WalletConnectButton: React.FC = () => {
  const { ready, authenticated, login, user, createWallet } = usePrivy();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { shortAddress } = useWalletActions();

  // Auto-create embedded wallet when user connects with external wallet
  useEffect(() => {
    const autoCreateEmbeddedWallet = async () => {
      if (!authenticated || !user) return;

      const embeddedWallets = user.linkedAccounts?.filter(
        (account: any) =>
          account.type === 'wallet' && account.imported === false && account.id !== undefined,
      );

      if (!embeddedWallets || embeddedWallets.length === 0) {
        const toastId = toast.loading('Setting up your embedded wallet...');

        try {
          await createWallet();
          toast.success('Embedded wallet created successfully!', {
            id: toastId,
            duration: 3000,
          });
        } catch (error: any) {
          if (error?.message?.includes('already has')) {
            toast.dismiss(toastId);
          } else {
            toast.error('Failed to create embedded wallet', {
              id: toastId,
            });
          }
        }
      }
    };

    autoCreateEmbeddedWallet();
  }, [authenticated, user, createWallet]);

  // Auto-switch to Base when authenticated
  useEffect(() => {
    if (authenticated && chainId !== baseSepolia.id) {
      switchChain({ chainId: baseSepolia.id });
      toast.success('Switching to Base Sepolia network...');
    }
  }, [authenticated, chainId, switchChain]);

  if (!ready) {
    return null;
  }

  if (authenticated) {
    return (
      <div className="flex items-center">
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg px-5 py-3 text-base font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Wallet className="w-5 h-5" />
              {shortAddress}
            </button>
          </DialogTrigger>

          <DialogContent
            className="w-full max-w-[520px] bg-[#16181D] border-slate-700/50 text-slate-100 p-0 overflow-hidden"
            showCloseButton={false}
          >
            <WalletDialogContent />
          </DialogContent>
        </Dialog>

        <NetworkSwitcher />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={login}
        className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg md:px-5 px-3 md:py-3 py-1 text-base font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer"
      >
        <Wallet className="w-5 h-5" />
        Connect wallet
      </button>

      <div className="relative group">
        <button
          className="flex items-center justify-center w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
          title="Sepolia Base"
        >
          <img
            src="data:image/svg+xml,%3Csvg width='111' height='111' viewBox='0 0 111 111' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z' fill='%230052FF'/%3E%3C/svg%3E"
            alt="Base"
            className="w-6 h-6"
          />
        </button>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
          Sepolia Base
        </div>
      </div>
    </div>
  );
};

export default WalletConnectButton;
