/**
 * Hooks for Market Order Trading with MarketExecutor
 */

import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, encodeFunctionData, keccak256, encodePacked } from 'viem';
import { useState, useCallback, useEffect } from 'react';
import { baseSepolia } from 'wagmi/chains';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import {
  MARKET_EXECUTOR_ADDRESS,
  STABILITY_FUND_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from '@/config/contracts';
import MarketExecutorJSON from '@/contracts/abis/MarketExecutor.json';
import MockUSDCABI from '@/contracts/abis/MockUSDC.json';

// Extract ABI array from MarketExecutor JSON (has {abi: [...]} structure)
// MockUSDC is already array format
const MarketExecutorABI = (MarketExecutorJSON as any).abi;
import { getSignedPrice, SignedPriceData } from '@/lib/priceApi';
import { relayTransaction } from '@/lib/relayApi';
import { toast } from 'sonner';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export interface OpenPositionParams {
  symbol: string;
  isLong: boolean;
  collateral: string; // USDC amount
  leverage: number;
}

export interface ClosePositionParams {
  positionId: bigint;
  symbol: string;
}

/**
 * Hook to check and approve USDC for StabilityFund (single approval target)
 */
export function useApproveUSDCForTrading() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Check current allowance - with auto-polling every 2 seconds for real-time updates
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: 'allowance',
    args: address ? [address, STABILITY_FUND_ADDRESS] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 2000, // Poll every 2 seconds for real-time allowance updates
    },
  });

  const approve = async (amount: string) => {
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

      const amountBigInt = parseUnits(amount, USDC_DECIMALS);

      const data = encodeFunctionData({
        abi: MockUSDCABI,
        functionName: 'approve',
        args: [STABILITY_FUND_ADDRESS, amountBigInt],
      });

      const { hash } = await sendTransaction(
        {
          to: USDC_ADDRESS,
          data,
        },
        {
          sponsor: true,
          address: embeddedWallet.address,
        },
      );

      setHash(hash as `0x${string}`);
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

  // Auto-refetch allowance when approval transaction is confirmed
  useEffect(() => {
    if (isSuccess) {
      refetchAllowance();
    }
  }, [isSuccess, refetchAllowance]);

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
 * Hook to open a market position
 */
export function useOpenMarketPosition() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const openPosition = useCallback(
    async (params: OpenPositionParams) => {
      try {
        setIsLoadingPrice(true);
        setIsPending(true);
        setError(null);

        // Get signed price from backend
        const signedPrice: SignedPriceData = await getSignedPrice(params.symbol);

        setIsLoadingPrice(false);

        // Parse collateral
        const collateralBigInt = parseUnits(params.collateral, USDC_DECIMALS);

        // Calculate total fee (trading fee)
        const positionSize = collateralBigInt * BigInt(params.leverage);
        const tradingFee = (positionSize * 5n) / 10000n; // 0.05% = 5 basis points

        // Total amount needed: collateral + fee
        const totalAmount = collateralBigInt + tradingFee;

        // Find embedded wallet
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

        // Encode function call
        const data = encodeFunctionData({
          abi: MarketExecutorABI,
          functionName: 'openMarketPosition',
          args: [
            params.symbol,
            params.isLong,
            collateralBigInt,
            BigInt(params.leverage),
            {
              symbol: params.symbol, // Contract expects symbol string, not assetId
              price: BigInt(signedPrice.price),
              timestamp: BigInt(signedPrice.timestamp),
              signature: signedPrice.signature as `0x${string}`,
            },
          ],
        });

        const now = Math.floor(Date.now() / 1000);
        const timeDiff = signedPrice.timestamp - now;

        if (timeDiff > 0) {
          throw new Error(
            `Price timestamp is ${timeDiff}s in the future! Backend clock may be wrong.`,
          );
        }

        // Check USDC allowance
        try {
          const allowanceCheck = await walletClient.request({
            method: 'eth_call',
            params: [
              {
                to: USDC_ADDRESS,
                data: encodeFunctionData({
                  abi: MockUSDCABI,
                  functionName: 'allowance',
                  args: [address, STABILITY_FUND_ADDRESS],
                }),
              },
              'latest',
            ],
          });
          const allowanceBigInt = BigInt(allowanceCheck as string);

          if (allowanceBigInt < totalAmount) {
            throw new Error(
              `Insufficient USDC allowance. Have: ${allowanceBigInt}, Need: ${totalAmount}. Please approve USDC first.`,
            );
          }
        } catch (err: any) {
          console.error('❌ Allowance check failed:', err);
          if (err.message?.includes('Insufficient')) throw err;
        }

        // Check USDC balance
        try {
          const balanceCheck = await walletClient.request({
            method: 'eth_call',
            params: [
              {
                to: USDC_ADDRESS,
                data: encodeFunctionData({
                  abi: MockUSDCABI,
                  functionName: 'balanceOf',
                  args: [address],
                }),
              },
              'latest',
            ],
          });
          const balanceBigInt = BigInt(balanceCheck as string);

          if (balanceBigInt < totalAmount) {
            throw new Error(
              `Insufficient USDC balance. Have: ${balanceBigInt}, Need: ${totalAmount}`,
            );
          }
        } catch (err: any) {
          console.error('❌ Balance check failed:', err);
          if (err.message?.includes('Insufficient')) throw err;
        }

        // Estimate gas first
        let gasEstimate: bigint;
        try {
          const estimate = await walletClient.request({
            method: 'eth_estimateGas',
            params: [
              {
                from: address,
                to: MARKET_EXECUTOR_ADDRESS,
                data,
              },
            ],
          });
          gasEstimate = typeof estimate === 'string' ? BigInt(estimate) : (estimate as bigint);
        } catch (err) {
          console.error('❌ Gas estimation failed:', err);
          throw new Error(
            'Transaction will fail. Check: 1) Signature validity 2) Sufficient allowance 3) Contract state',
          );
        }

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * 120n) / 100n;

        // Send transaction with gas limit
        const txHash = await walletClient.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: MARKET_EXECUTOR_ADDRESS,
              data,
              gas: '0x' + gasLimit.toString(16),
            },
          ],
        });

        setHash(txHash as `0x${string}`);
      } catch (err) {
        setIsLoadingPrice(false);
        console.error('❌ Error opening position:', err);
        setError(err as Error);
        toast.error('Failed to open position: ' + (err as Error).message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    openPosition,
    isPending: isPending || isLoadingPrice,
    isConfirming,
    isSuccess,
    error,
    hash,
    isLoadingPrice,
  };
}

/**
 * Hook to close a market position (non-gasless version - user pays gas)
 * Use this as fallback when gasless version has issues
 */
export function useCloseMarketPosition() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const closePosition = useCallback(
    async (params: ClosePositionParams) => {
      try {
        setIsLoadingPrice(true);
        setIsPending(true);
        setError(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Find embedded wallet
        const embeddedWallet = wallets.find(
          (w) => w.walletClientType === 'privy' && w.address === address,
        );

        if (!embeddedWallet) {
          throw new Error('Embedded wallet not found');
        }

        // Get signed price from backend
        const signedPrice: SignedPriceData = await getSignedPrice(params.symbol);

        setIsLoadingPrice(false);

        await embeddedWallet.switchChain(baseSepolia.id);
        const walletClient = await embeddedWallet.getEthereumProvider();

        if (!walletClient) {
          throw new Error('Could not get wallet client');
        }

        // Encode function call
        const data = encodeFunctionData({
          abi: MarketExecutorABI,
          functionName: 'closeMarketPosition',
          args: [
            params.positionId,
            {
              symbol: params.symbol,
              price: BigInt(signedPrice.price),
              timestamp: BigInt(signedPrice.timestamp),
              signature: signedPrice.signature as `0x${string}`,
            },
          ],
        });

        // Estimate gas
        const gasEstimate = await walletClient.request({
          method: 'eth_estimateGas',
          params: [
            {
              from: address,
              to: MARKET_EXECUTOR_ADDRESS,
              data,
            },
          ],
        });

        const gasLimit = (BigInt(gasEstimate as string) * 120n) / 100n; // 20% buffer

        // Send transaction (user pays gas)
        const txHash = await walletClient.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: MARKET_EXECUTOR_ADDRESS,
              data,
              gas: '0x' + gasLimit.toString(16),
            },
          ],
        });

        setHash(txHash as `0x${string}`);
      } catch (err) {
        setIsLoadingPrice(false);
        console.error('\u274c Error closing position:', err);
        setError(err as Error);
        toast.error('Failed to close position: ' + (err as Error).message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    closePosition,
    isPending: isPending || isLoadingPrice,
    isConfirming,
    isSuccess,
    error,
    hash,
    isLoadingPrice,
  };
}

/**
 * Hook to get trading fees
 */
export function useTradingFees() {
  const { data, isLoading } = useReadContract({
    address: MARKET_EXECUTOR_ADDRESS,
    abi: MarketExecutorABI,
    functionName: 'tradingFeeBps',
  });

  const tradingFeeBps = data as bigint | undefined;

  return {
    tradingFeeBps,
    tradingFeePercent: tradingFeeBps ? Number(tradingFeeBps) / 100 : 0.05, // Default 0.05%
    isLoading,
  };
}

/**
 * Calculate total cost for opening a position (collateral + fee)
 */
export function calculatePositionCost(
  collateralUsd: string,
  leverage: number,
  tradingFeeBps: number = 5, // Default 0.05%
): { totalCost: string; tradingFee: string; positionSize: string } {
  try {
    const collateral = parseFloat(collateralUsd);
    if (isNaN(collateral) || collateral <= 0) {
      return { totalCost: '0', tradingFee: '0', positionSize: '0' };
    }

    const positionSize = collateral * leverage;
    const tradingFee = (positionSize * tradingFeeBps) / 100000;
    const totalCost = collateral + tradingFee;

    return {
      totalCost: totalCost.toFixed(6),
      tradingFee: tradingFee.toFixed(6),
      positionSize: positionSize.toFixed(2),
    };
  } catch (error) {
    console.error('Error calculating position cost:', error);
    return { totalCost: '0', tradingFee: '0', positionSize: '0' };
  }
}

/**
 * Combined hook for complete market order flow
 */
export function useMarketOrderFlow() {
  const {
    approve,
    hasAllowance,
    isSuccess: isApproveSuccess,
    isPending: isApprovePending,
    refetchAllowance,
  } = useApproveUSDCForTrading();

  const {
    openPosition,
    isSuccess: isOpenSuccess,
    isPending: isOpenPending,
    hash: openHash,
    error: openError,
  } = useOpenMarketPosition();

  const [step, setStep] = useState<'idle' | 'approving' | 'opening' | 'success' | 'error'>('idle');
  const [pendingParams, setPendingParams] = useState<OpenPositionParams | null>(null);

  /**
   * Execute full flow: check allowance -> approve if needed -> open position
   */
  const executeMarketOrder = useCallback(
    async (params: OpenPositionParams) => {
      try {
        setStep('idle');
        setPendingParams(params); // Save params for retry after approval

        // Calculate total amount needed
        const { totalCost } = calculatePositionCost(params.collateral, params.leverage);

        // Check if allowance is sufficient
        if (!hasAllowance(totalCost)) {
          setStep('approving');
          toast.loading('Approving USDC...', { id: 'market-order' });
          await approve(totalCost);
          // Wait for approval - will auto-continue via useEffect
          return;
        }

        // Open position
        setStep('opening');
        toast.loading('Opening position...', { id: 'market-order' });
        await openPosition(params);
        setPendingParams(null); // Clear after successful open
      } catch (error) {
        setStep('error');
        setPendingParams(null);
        console.error('Error executing market order:', error);
        toast.error('Failed to execute market order', { id: 'market-order' });
      }
    },
    [approve, hasAllowance, openPosition],
  );

  // Handle approval success - auto-continue to open position
  useEffect(() => {
    if (isApproveSuccess && step === 'approving' && pendingParams) {
      refetchAllowance();
      toast.success('USDC approved! Opening position...', { id: 'market-order' });

      // Continue with opening position
      setStep('opening');
      openPosition(pendingParams)
        .then(() => {
          setPendingParams(null);
        })
        .catch((err) => {
          console.error('Error opening position after approval:', err);
          setStep('error');
          setPendingParams(null);
          toast.error('Failed to open position', { id: 'market-order' });
        });
    }
  }, [isApproveSuccess, step, pendingParams, refetchAllowance, openPosition]);

  // Handle open success
  useEffect(() => {
    if (isOpenSuccess && step === 'opening') {
      setStep('success');
      toast.success('Position opened successfully!', { id: 'market-order' });
    }
  }, [isOpenSuccess, step]);

  // Handle open error
  useEffect(() => {
    if (openError && step === 'opening') {
      setStep('error');
      toast.error('Failed to open position', { id: 'market-order' });
    }
  }, [openError, step]);

  return {
    executeMarketOrder,
    step,
    isProcessing: isApprovePending || isOpenPending,
    openHash,
    openError,
  };
}

/**
| * Hook for GASLESS market orders using relay service
| * User pays gas in USDC from paymaster deposit
| */
export function useRelayMarketOrder() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [usdcCharged, setUsdcCharged] = useState<string>('0');
  const [metaNonce, setMetaNonce] = useState<bigint>(0n);
  const [positionId, setPositionId] = useState<number | undefined>();

  const openPositionGasless = useCallback(
    async (params: OpenPositionParams) => {
      try {
        setIsPending(true);
        setError(null);
        setIsSuccess(false);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Find embedded wallet
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

        // Get signed price from backend
        const signedPrice: SignedPriceData = await getSignedPrice(params.symbol);

        // Parse collateral
        const collateralBigInt = parseUnits(params.collateral, USDC_DECIMALS);

        // Fetch current nonce for this user from contract (ALWAYS fetch fresh nonce!)
        let currentNonce: bigint;
        try {
          const nonceData = encodeFunctionData({
            abi: MarketExecutorABI,
            functionName: 'metaNonces',
            args: [address],
          });

          const nonceResult = await walletClient.request({
            method: 'eth_call',
            params: [
              {
                to: MARKET_EXECUTOR_ADDRESS,
                data: nonceData,
              },
              'latest',
            ],
          });

          currentNonce = BigInt(nonceResult as string);
          setMetaNonce(currentNonce);
        } catch (err) {
          console.error('❌ Error fetching nonce:', err);
          throw new Error('Failed to fetch nonce from contract');
        }

        // Create message to sign (must match contract's message format)
        const messageHash = keccak256(
          encodePacked(
            ['address', 'string', 'bool', 'uint256', 'uint256', 'uint256', 'address'],
            [
              address,
              params.symbol,
              params.isLong,
              collateralBigInt,
              BigInt(params.leverage),
              currentNonce, // Use freshly fetched nonce
              MARKET_EXECUTOR_ADDRESS,
            ],
          ),
        );

        // Request signature from user
        const userSignature = await walletClient.request({
          method: 'personal_sign',
          params: [messageHash, address],
        });

        // Encode meta-transaction function call
        const data = encodeFunctionData({
          abi: MarketExecutorABI,
          functionName: 'openMarketPositionMeta',
          args: [
            address, // trader
            params.symbol,
            params.isLong,
            collateralBigInt,
            BigInt(params.leverage),
            {
              symbol: params.symbol,
              price: BigInt(signedPrice.price),
              timestamp: BigInt(signedPrice.timestamp),
              signature: signedPrice.signature as `0x${string}`,
            },
            userSignature as `0x${string}`, // user's signature
          ],
        });

        // Relay transaction through backend (gasless!)
        const result = await relayTransaction({
          to: MARKET_EXECUTOR_ADDRESS,
          data,
          userAddress: address,
        });

        setHash(result.txHash as `0x${string}`);
        setUsdcCharged(result.usdcChargedFormatted);
        // Note: positionId needs to be extracted from transaction receipt or logs
        // For now, we'll set to 0 as a placeholder
        setPositionId(0);
        setIsSuccess(true);

        // Don't show toast here - let the component handle it with more details
      } catch (err) {
        console.error('❌ Error opening position (gasless):', err);
        setError(err as Error);
        toast.error((err as Error).message || 'Failed to open position');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    openPositionGasless,
    isPending,
    isSuccess,
    error,
    hash,
    usdcCharged,
    positionId,
  };
}

/**
 * Hook for GASLESS close position using relay service
 */
export function useRelayClosePosition() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const closePositionGasless = useCallback(
    async (params: ClosePositionParams) => {
      try {
        setIsPending(true);
        setError(null);
        setIsSuccess(false);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Find embedded wallet
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

        // Get signed price from backend
        const signedPrice: SignedPriceData = await getSignedPrice(params.symbol);

        // Fetch current nonce for this user from contract (ALWAYS fetch fresh nonce!)
        let currentNonce: bigint;
        try {
          const nonceData = encodeFunctionData({
            abi: MarketExecutorABI,
            functionName: 'metaNonces',
            args: [address],
          });

          const nonceResult = await walletClient.request({
            method: 'eth_call',
            params: [
              {
                to: MARKET_EXECUTOR_ADDRESS,
                data: nonceData,
              },
              'latest',
            ],
          });

          currentNonce = BigInt(nonceResult as string);
        } catch (err) {
          console.error('\u274c Error fetching nonce:', err);
          throw new Error('Failed to fetch nonce from contract');
        }

        // Create message to sign (must match contract's message format for closeMarketPositionMeta)
        const packedData = encodePacked(
          ['address', 'uint256', 'uint256', 'address'],
          [address, params.positionId, currentNonce, MARKET_EXECUTOR_ADDRESS],
        );
        const messageHash = keccak256(packedData);

        // Request signature from user
        const userSignature = await walletClient.request({
          method: 'personal_sign',
          params: [messageHash, address],
        });

        // Encode close position meta function call
        const data = encodeFunctionData({
          abi: MarketExecutorABI,
          functionName: 'closeMarketPositionMeta',
          args: [
            address, // trader
            params.positionId,
            {
              symbol: params.symbol,
              price: BigInt(signedPrice.price),
              timestamp: BigInt(signedPrice.timestamp),
              signature: signedPrice.signature as `0x${string}`,
            },
            userSignature as `0x${string}`, // user's signature
          ],
        });

        // Relay transaction through backend (gasless!)
        const result = await relayTransaction({
          to: MARKET_EXECUTOR_ADDRESS,
          data,
          userAddress: address,
        });

        setHash(result.txHash as `0x${string}`);
        setIsSuccess(true);

        toast.success(`Position closed successfully!`, { duration: 5000 });
      } catch (err) {
        console.error('\u274c Error closing position (gasless):', err);
        setError(err as Error);
        toast.error((err as Error).message || 'Failed to close position');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    closePositionGasless,
    isPending,
    isSuccess,
    error,
    hash,
  };
}
