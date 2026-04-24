import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWriteContract, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import React from 'react';
import { USDC_ADDRESS, MOCK_USDC_ABI } from '@/config/contracts';

type UseUSDCFaucetOptions = {
  onSuccess?: (txHash?: string) => void;
};

export const useUSDCFaucet = (options: UseUSDCFaucetOptions = {}) => {
  const { authenticated, user } = usePrivy();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaimUSDC = async () => {
    if (!authenticated || !user) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsClaiming(true);
    const loadingToast = toast.loading('Claiming USDC from faucet...');

    try {
      const txHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: 'faucet',
      });

      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      toast.success('USDC claimed successfully!', {
        id: loadingToast,
        duration: 4000,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tethra:refreshBalance'));
      }

      if (options.onSuccess) {
        options.onSuccess(txHash);
      }

      setTimeout(() => {
        toast.success(
          <div className="flex flex-col gap-1">
            <span>View on Explorer:</span>
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
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

      return txHash;
    } catch (error: any) {
      const msg =
        error?.shortMessage ||
        error?.message?.split('\n')[0] ||
        'Failed to claim USDC';
      toast.error(msg, { id: loadingToast });
    } finally {
      setIsClaiming(false);
    }
  };

  return { isClaiming, handleClaimUSDC };
};
