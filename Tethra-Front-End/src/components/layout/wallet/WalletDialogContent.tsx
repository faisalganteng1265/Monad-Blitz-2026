'use client';

import React, { useState } from 'react';
import { Copy, ExternalLink, LogOut, Wallet, Key, DollarSign, X, ShieldOff } from 'lucide-react';
import { DialogClose } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useWalletBalance } from '@/hooks/wallet/useWalletBalance';
import { useWalletActions } from '@/hooks/wallet/useWalletActions';
import { useUSDCFaucet } from '@/hooks/wallet/useUSDCFaucet';
import { useTapToTradeApproval } from '@/features/wallet/hooks/useTapToTradeApproval';
import { toast } from 'sonner';

export const WalletDialogContent: React.FC = () => {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExportConfirmed, setIsExportConfirmed] = useState(false);
  const { usdcBalance, refetchBalance, bumpBalance } = useWalletBalance();
  const {
    shortAddress,
    handleCopyAddress,
    handleViewExplorer,
    handleExportPrivateKey,
    handleDisconnect,
  } = useWalletActions();
  const { isClaiming, handleClaimUSDC } = useUSDCFaucet({
    onSuccess: () => {
      bumpBalance(100);
      refetchBalance();
    },
  });
  const { allowance, revoke, isPending: isRevoking } = useTapToTradeApproval();

  const handleRevoke = async () => {
    const toastId = 'revoke-stabilityfund-approval';
    toast.loading('Revoking USDC approval...', { id: toastId });
    try {
      await revoke();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tethra:allowanceUpdated'));
      }
      toast.success('USDC approval revoked', { id: toastId });
    } catch (error: any) {
      const message = error?.message || 'Failed to revoke approval';
      toast.error(message, { id: toastId });
    }
  };

  return (
    <>
      {/* Header Section */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Tethra Wallet</h2>
          <DialogClose asChild>
            <button className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </DialogClose>
        </div>

        {/* Wallet Address with Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Address Box */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-800/50 rounded-xl flex-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-slate-100 font-medium text-sm">{shortAddress}</span>
            <button
              onClick={handleCopyAddress}
              className="p-1 hover:bg-slate-700/50 rounded-md transition-colors ml-auto cursor-pointer"
              title="Copy Address"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
            </button>
          </div>

          {/* Action Icon Buttons - Separated */}
          <button
            onClick={handleViewExplorer}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
            title="View on Explorer"
          >
            <ExternalLink className="w-4 h-4 text-slate-400 hover:text-slate-200" />
          </button>

          <AlertDialog
            open={isExportDialogOpen}
            onOpenChange={(open) => {
              setIsExportDialogOpen(open);
              if (!open) setIsExportConfirmed(false);
            }}
          >
            <AlertDialogTrigger asChild>
              <button
                className="p-2.5 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
                title="Export Private Key"
              >
                <Key className="w-4 h-4 text-slate-400 hover:text-slate-200" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#131B26] border-gray-800 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Export private key?</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  This is a one-time export. If you log in again, your embedded wallet may
                  change. Anyone with this key can access your funds—store it safely.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={isExportConfirmed}
                  onChange={(e) => setIsExportConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-600 bg-transparent text-red-500 focus:ring-0"
                />
                <span>I understand</span>
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleExportPrivateKey}
                  disabled={!isExportConfirmed}
                  className="bg-red-600 hover:bg-red-700 text-white border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <button
            onClick={handleDisconnect}
            className="p-2.5 bg-red-500 hover:bg-red-600 rounded-xl transition-colors cursor-pointer"
            title="Disconnect"
          >
            <LogOut className="w-4 h-4 text-white hover:text-white" />
          </button>
        </div>
      </div>

      {/* Balance Section */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <span>Balance</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg">
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">$</span>
            </div>
            <span className="text-slate-100 text-sm font-medium">USDC</span>
          </div>
        </div>

        <div className="text-4xl font-bold text-slate-100 mb-5">
          <span>{usdcBalance === null ? '-' : `$${usdcBalance}`}</span>
        </div>

        {/* Deposit, Withdraw & Faucet Buttons */}
        <div className="grid grid-cols-4 gap-3">
          <button className="py-3 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-slate-100 font-medium transition-colors cursor-pointer">
            Deposit
          </button>
          <button className="py-3 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-slate-100 font-medium transition-colors cursor-pointer">
            Withdraw
          </button>
          <button
            onClick={handleClaimUSDC}
            disabled={isClaiming}
            className="py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
            title="Faucet 100 Mock USDC"
          >
            <DollarSign className="w-4 h-4" />
            {isClaiming ? 'Fauceting...' : 'Faucet'}
          </button>
          <button
            onClick={handleRevoke}
            disabled={isRevoking || !allowance || allowance === 0n}
            className="py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-900/60 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
            title="Revoke USDC approval for Stability Fund"
          >
            <ShieldOff className="w-4 h-4" />
            {isRevoking ? 'Revoking...' : 'Revoke'}
          </button>
        </div>
      </div>

      {/* Funding Activity Section */}
      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">Funding Activity</h3>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search"
            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-slate-600 transition-colors"
          />
          <svg
            className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Empty State */}
        <div className="py-8 text-center">
          <p className="text-slate-500 text-sm">No funding activity yet</p>
        </div>
      </div>
    </>
  );
};
