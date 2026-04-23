/**
 * Hooks for USDC Paymaster interactions
 */

import {
  useReadContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useWriteContract,
} from 'wagmi';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { useState, useEffect } from 'react';
import { baseSepolia } from 'wagmi/chains';
import { useWallets } from '@privy-io/react-auth';
import { USDC_PAYMASTER_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '@/config/contracts';
import USDCPaymasterABI from '@/contracts/abis/USDCPaymaster.json';
import MockUSDCABI from '@/contracts/abis/MockUSDC.json';
import { useEmbeddedWallet } from './useEmbeddedWallet';

/**
 * Hook to get user's USDC deposit balance in paymaster
 */
export function usePaymasterBalance() {
  const { address } = useEmbeddedWallet();

  const {
    data: balance,
    isLoading,
    refetch,
  } = useReadContract({
    address: USDC_PAYMASTER_ADDRESS,
    abi: USDCPaymasterABI,
    functionName: 'getUserDeposit',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  return {
    balance: balance ? formatUnits(balance as bigint, USDC_DECIMALS) : '0',
    balanceRaw: balance as bigint | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to deposit USDC to paymaster
 */
export function useDepositToPaymaster() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const deposit = async (amount: string) => {
    try {
      setIsPending(true);
      setError(null);

      const embeddedWallet = wallets.find(
        (w) => w.walletClientType === 'privy' && w.address === address,
      );

      if (!embeddedWallet) {
        throw new Error('Embedded wallet not found');
      }

      await embeddedWallet.switchChain(baseSepolia.id);
      const walletClient = await embeddedWallet.getEthereumProvider();

      if (!walletClient) {
        throw new Error('Could not get wallet client');
      }

      const amountBigInt = parseUnits(amount, USDC_DECIMALS);

      const data = encodeFunctionData({
        abi: USDCPaymasterABI,
        functionName: 'deposit',
        args: [amountBigInt],
      });

      const txHash = await walletClient.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: USDC_PAYMASTER_ADDRESS,
            data,
          },
        ],
      });

      setHash(txHash as `0x${string}`);
    } catch (err) {
      console.error('❌ Deposit error:', err);
      setError(err as Error);
    } finally {
      setIsPending(false);
    }
  };

  return {
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

/**
 * Hook to withdraw USDC from paymaster
 */
export function useWithdrawFromPaymaster() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const withdraw = async (amount: string) => {
    const amountBigInt = parseUnits(amount, USDC_DECIMALS);

    await writeContractAsync({
      address: USDC_PAYMASTER_ADDRESS,
      abi: USDCPaymasterABI,
      functionName: 'withdraw',
      args: [amountBigInt],
      chainId: baseSepolia.id,
    });
  };

  return {
    withdraw,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

/**
 * Hook to check and approve USDC for paymaster
 */
export function useApproveUSDCForPaymaster() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: 'allowance',
    args: address ? [address, USDC_PAYMASTER_ADDRESS] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const approve = async (amount: string) => {
    try {
      setIsPending(true);
      setError(null);

      // Find embedded wallet
      const embeddedWallet = wallets.find(
        (w) => w.walletClientType === 'privy' && w.address === address,
      );

      if (!embeddedWallet) {
        throw new Error('Embedded wallet not found');
      }

      const amountBigInt = parseUnits(amount, USDC_DECIMALS);

      // Switch to correct chain first
      await embeddedWallet.switchChain(baseSepolia.id);

      // Get wallet client
      const walletClient = await embeddedWallet.getEthereumProvider();

      if (!walletClient) {
        throw new Error('Could not get wallet client');
      }

      // Encode approve function call
      const data = encodeFunctionData({
        abi: MockUSDCABI,
        functionName: 'approve',
        args: [USDC_PAYMASTER_ADDRESS, amountBigInt],
      });

      // Send transaction using provider
      const txHash = await walletClient.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: USDC_ADDRESS,
            data,
          },
        ],
      });

      setHash(txHash as `0x${string}`);
    } catch (err) {
      console.error('❌ Approve error:', err);
      setError(err as Error);
    } finally {
      setIsPending(false);
    }
  };

  const hasAllowance = (requiredAmount: string): boolean => {
    if (!allowance) return false;
    const required = parseUnits(requiredAmount, USDC_DECIMALS);
    return (allowance as bigint) >= required;
  };

  return {
    approve,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    allowance: allowance as bigint | undefined,
    hasAllowance,
    refetchAllowance,
  };
}

/**
 * Hook to get paymaster exchange rate info
 */
export function usePaymasterRateInfo() {
  const { data, isLoading, refetch } = useReadContract({
    address: USDC_PAYMASTER_ADDRESS,
    abi: USDCPaymasterABI,
    functionName: 'getRateInfo',
  });

  const rateData = data as [bigint, bigint] | undefined;

  return {
    usdcPerEth: rateData?.[0],
    premiumBps: rateData?.[1],
    isLoading,
    refetch,
  };
}

/**
 * Hook to calculate USDC cost for gas
 */
export function useCalculateGasCost(gasAmount: bigint | undefined) {
  const { data: cost, isLoading } = useReadContract({
    address: USDC_PAYMASTER_ADDRESS,
    abi: USDCPaymasterABI,
    functionName: 'calculateUsdcCost',
    args: gasAmount ? [gasAmount] : undefined,
    query: {
      enabled: !!gasAmount && gasAmount > 0n,
    },
  });

  return {
    cost: cost as bigint | undefined,
    costFormatted: cost ? formatUnits(cost as bigint, USDC_DECIMALS) : '0',
    isLoading,
  };
}

/**
 * Combined hook for paymaster flow management
 */
export function usePaymasterFlow() {
  const [isApproving, setIsApproving] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);

  const { balance, balanceRaw, refetch: refetchBalance } = usePaymasterBalance();
  const {
    approve,
    isSuccess: isApproveSuccess,
    hasAllowance,
    refetchAllowance,
  } = useApproveUSDCForPaymaster();
  const { deposit, isSuccess: isDepositSuccess } = useDepositToPaymaster();

  // Refetch balance when deposit is successful
  useEffect(() => {
    if (isDepositSuccess) {
      refetchBalance();
      setIsDepositing(false);
    }
  }, [isDepositSuccess, refetchBalance]);

  // Refetch allowance when approve is successful
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
      setIsApproving(false);
    }
  }, [isApproveSuccess, refetchAllowance]);

  /**
   * Ensure paymaster has sufficient balance
   * Will approve and deposit if needed
   */
  const ensurePaymasterBalance = async (requiredAmount: string): Promise<boolean> => {
    try {
      // Check if balance is sufficient
      const balanceNum = parseFloat(balance);
      const requiredNum = parseFloat(requiredAmount);

      if (balanceNum >= requiredNum) {
        return true; // Already have enough balance
      }

      const depositAmount = (requiredNum - balanceNum + 10).toFixed(6); // Add 10 USDC buffer

      // Check allowance
      if (!hasAllowance(depositAmount)) {
        setIsApproving(true);
        await approve(depositAmount);
        // Wait for approval to complete
        return false; // Need to retry after approval
      }

      // Deposit
      setIsDepositing(true);
      await deposit(depositAmount);
      return false; // Need to wait for deposit to complete
    } catch (error) {
      console.error('Error ensuring paymaster balance:', error);
      setIsApproving(false);
      setIsDepositing(false);
      return false;
    }
  };

  return {
    balance,
    balanceRaw,
    isApproving,
    isDepositing,
    ensurePaymasterBalance,
    refetchBalance,
  };
}
