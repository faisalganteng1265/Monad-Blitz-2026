import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { BACKEND_API_URL } from '@/config/contracts';
import React from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

type UseUSDCFaucetOptions = {
  onSuccess?: (txHash?: string) => void;
};

export const useUSDCFaucet = (options: UseUSDCFaucetOptions = {}) => {
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

      if (options.onSuccess) {
        options.onSuccess(txHash);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tethra:refreshBalance'));
      }

      if (txHash) {
        setTimeout(() => {
          toast.success(
            <div className="flex flex-col gap-1">
              <span>View on Explorer:</span>
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400 hover:text-blue-300"
              >
                Click here
              </a>
            </div>,
            { duration: 5000 },
          );
        }, 500);
      }

      return txHash;
    } catch (error: any) {
      let errorMessage = 'Failed to claim USDC from faucet';
      if (error?.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setIsClaiming(false);
    }
  };

  return { isClaiming, handleClaimUSDC };
};
