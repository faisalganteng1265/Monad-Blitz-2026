'use client';

import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'react-hot-toast';
import { DollarSign } from 'lucide-react';
import { BACKEND_API_URL } from '@/config/contracts';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const ClaimUSDCButton: React.FC = () => {
  const { authenticated, user } = usePrivy();
  const { address } = useEmbeddedWallet();
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaimUSDC = async () => {
    if (!authenticated || !user) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!address) {
      toast.error('Embedded wallet not found');
      return;
    }

    const walletAddress = address;
    setIsClaiming(true);
    const loadingToast = toast.loading('Claiming USDC from faucet...');

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/faucet/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: walletAddress }),
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error || 'Failed to claim USDC from faucet';
        throw new Error(errorMessage);
      }

      const txHash = payload?.data?.transactionHash;

      toast.success('USDC claimed successfully!', {
        id: loadingToast,
        duration: 4000,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tethra:refreshBalance'));
      }

      if (txHash) {
        setTimeout(() => {
          toast.success(
            <div>
              View on Explorer:{' '}
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Click here
              </a>
            </div>,
            { duration: 5000 },
          );
        }, 500);
      }

    } catch (error: any) {
      let errorMessage = 'Failed to claim USDC from faucet';
      if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage, {
        id: loadingToast,
      });
    } finally {
      setIsClaiming(false);
    }
  };

  if (!authenticated) {
    return null;
  }

  return (
    <button
      onClick={handleClaimUSDC}
      disabled={isClaiming}
      className="hidden xl:flex items-center gap-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg px-5 py-3 text-base font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg whitespace-nowrap cursor-pointer"
      title="Claim 100 Mock USDC"
    >
      <DollarSign className="w-5 h-5" />
      {isClaiming ? 'Claiming...' : 'Claim USDC'}
    </button>
  );
};

export default ClaimUSDCButton;
