/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSwitchChain, useChainId } from 'wagmi';
import { monadTestnet } from '@/config/chains';
import { toast } from 'sonner';
import { Wallet, Copy, ExternalLink, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NetworkSwitcher } from '@/components/layout/wallet/NetworkSwitcher';
import { useWalletActions } from '@/hooks/wallet/useWalletActions';
import { useWalletBalance } from '@/hooks/wallet/useWalletBalance';

const WalletConnectButton: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { shortAddress, handleCopyAddress, handleViewExplorer, handleDisconnect } =
    useWalletActions();
  const { usdcBalance } = useWalletBalance();

  // Auto-switch to Monad when authenticated
  useEffect(() => {
    if (authenticated && chainId !== monadTestnet.id) {
      switchChain({ chainId: monadTestnet.id });
      toast.success('Switching to Monad Testnet network...');
    }
  }, [authenticated, chainId, switchChain]);

  if (!ready) return null;

  if (authenticated) {
    return (
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg px-5 py-3 text-base font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer outline-none">
              <Wallet className="w-5 h-5" />
              {shortAddress}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-72 bg-[#16181D] border border-slate-700/50 text-slate-100 p-0 rounded-xl overflow-hidden shadow-2xl"
          >
            {/* Address row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-slate-100 font-medium text-sm flex-1">{shortAddress}</span>
              <button
                onClick={handleCopyAddress}
                className="p-1.5 hover:bg-slate-700/50 rounded-md transition-colors"
                title="Copy address"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={handleViewExplorer}
                className="p-1.5 hover:bg-slate-700/50 rounded-md transition-colors"
                title="View on explorer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            {/* Balance */}
            <div className="px-4 py-3 border-b border-slate-700/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 text-xs">Balance</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800/60 rounded-md">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">$</span>
                  </div>
                  <span className="text-slate-200 text-xs font-medium">USDC</span>
                </div>
              </div>
              <span className="text-2xl font-bold text-slate-100">
                {usdcBalance === null ? '—' : `$${parseFloat(usdcBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>

            {/* Disconnect */}
            <div className="px-4 py-2">
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 rounded-lg text-red-400 hover:text-red-300 text-sm font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

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
          title="Monad Testnet"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="12" fill="#836EF9"/>
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">M</text>
          </svg>
        </button>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
          Monad Testnet
        </div>
      </div>
    </div>
  );
};

export default WalletConnectButton;
