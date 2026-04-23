/**
 * Hooks for Limit Order Trading with LimitExecutor
 *
 * Supports:
 * - Limit Open Orders: Open position when price reaches trigger
 * - Limit Close Orders: Close position at target price (take profit)
 * - Stop Loss Orders: Close position to limit losses
 */

import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  parseUnits,
  encodeFunctionData,
  keccak256,
  encodePacked,
  formatUnits,
  createPublicClient,
  http,
} from 'viem';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { baseSepolia } from 'wagmi/chains';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import {
  LIMIT_EXECUTOR_ADDRESS,
  STABILITY_FUND_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  RPC_URL,
} from '@/config/contracts';
import LimitExecutorJSON from '@/contracts/abis/LimitExecutor.json';
import MockUSDCABI from '@/contracts/abis/MockUSDC.json';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';
import { toast } from 'sonner';
import { getLimitExecutionFee } from '@/lib/relayApi';
import { submitLimitOpenOrder } from '@/lib/limitOrderApi';

// Extract ABI from JSON
const LimitExecutorABI = (LimitExecutorJSON as any).abi;

// Order types enum (matches smart contract)
export enum OrderType {
  LIMIT_OPEN = 0,
  LIMIT_CLOSE = 1,
  STOP_LOSS = 2,
}

export enum OrderStatus {
  PENDING = 0,
  EXECUTED = 1,
  CANCELLED = 2,
}

export interface Order {
  id: bigint;
  orderType: OrderType;
  status: OrderStatus;
  trader: string;
  symbol: string;
  isLong: boolean;
  collateral: bigint;
  leverage: bigint;
  triggerPrice: bigint;
  positionId: bigint;
  createdAt: bigint;
  executedAt: bigint;
  expiresAt: bigint;
  nonce: bigint;
}

export interface CreateLimitOpenParams {
  symbol: string;
  isLong: boolean;
  collateral: string; // USDC amount
  leverage: number;
  triggerPrice: string; // Price with 8 decimals
  takeProfit?: string; // Optional TP price (8 decimals)
  stopLoss?: string; // Optional SL price (8 decimals)
  expiresAt?: number; // Optional custom expiry (unix)
}

export interface CreateLimitCloseParams {
  positionId: bigint;
  triggerPrice: string; // Price with 8 decimals
}

export interface CreateStopLossParams {
  positionId: bigint;
  triggerPrice: string; // Price with 8 decimals
}

/**
 * Hook to check and approve USDC for StabilityFund (single approval target)
 */
export function useApproveUSDCForLimitOrders() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
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
    args: address ? [address, STABILITY_FUND_ADDRESS] : undefined,
    query: {
      enabled: !!address,
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
 * Hook to fetch LimitExecutor configuration (e.g. trading fee)
 */
export function useLimitExecutorConfig() {
  const { data: tradingFeeBps } = useReadContract({
    address: LIMIT_EXECUTOR_ADDRESS,
    abi: LimitExecutorABI,
    functionName: 'tradingFeeBps',
    query: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  return {
    tradingFeeBps: (tradingFeeBps as bigint | undefined) ?? 5n,
  };
}

/**
 * Hook to get execution fee
 */
export function useExecutionFee(
  orderType: 'limit_open' | 'limit_close' | 'stop_loss' = 'limit_open',
) {
  const [executionFee, setExecutionFee] = useState<bigint | undefined>(undefined);
  const [formatted, setFormatted] = useState<string>('0.00');
  const [gasEstimate, setGasEstimate] = useState<string>('0');
  const [baseFormatted, setBaseFormatted] = useState<string>('0.00');
  const [bufferBps, setBufferBps] = useState<number>(2000);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const estimate = await getLimitExecutionFee(orderType);

      setExecutionFee(BigInt(estimate.recommendedMaxExecutionFee));
      setFormatted(estimate.recommendedFormatted);
      setGasEstimate(estimate.gasEstimate);
      setBaseFormatted(estimate.baseCostFormatted);
      setBufferBps(estimate.bufferBps);
    } catch (err) {
      console.error('Failed to load execution fee estimate:', err);
      setError(err as Error);
      setExecutionFee(undefined);
      setFormatted('0.00');
    } finally {
      setIsLoading(false);
    }
  }, [orderType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    executionFee,
    executionFeeFormatted: formatted,
    baseFeeFormatted: baseFormatted,
    gasEstimate,
    bufferBps,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Hook to create a limit open order
 */
export function useCreateLimitOpenOrder() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [submission, setSubmission] = useState<{
    orderId: string;
    txHash: string;
    expiresAt: bigint;
    nonce: bigint;
  } | null>(null);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
      }),
    [],
  );

  const createOrder = useCallback(
    async (params: CreateLimitOpenParams) => {
      try {
        setIsPending(true);
        setError(null);
        setSubmission(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

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

        // Parse values
        const collateralBigInt = parseUnits(params.collateral, USDC_DECIMALS);
        const triggerPriceBigInt = parseUnits(params.triggerPrice, 8);
        const leverageBigInt = BigInt(Math.round(params.leverage));

        // Fetch latest user nonce from contract
        const nonce = (await publicClient.readContract({
          address: LIMIT_EXECUTOR_ADDRESS,
          abi: LimitExecutorABI,
          functionName: 'getUserCurrentNonce',
          args: [address],
        })) as bigint;

        const expiresAt =
          params.expiresAt !== undefined
            ? BigInt(params.expiresAt)
            : BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60); // default 30 days

        // Prepare message hash for signing
        const messageHash = keccak256(
          encodePacked(
            [
              'address',
              'string',
              'bool',
              'uint256',
              'uint256',
              'uint256',
              'uint256',
              'uint256',
              'address',
            ],
            [
              address,
              params.symbol,
              params.isLong,
              collateralBigInt,
              leverageBigInt,
              triggerPriceBigInt,
              nonce,
              expiresAt,
              LIMIT_EXECUTOR_ADDRESS,
            ],
          ),
        );

        const signature = (await walletClient.request({
          method: 'personal_sign',
          params: [messageHash, address],
        })) as `0x${string}`;

        const result = await submitLimitOpenOrder({
          trader: address,
          symbol: params.symbol,
          isLong: params.isLong,
          collateral: collateralBigInt.toString(),
          leverage: leverageBigInt.toString(),
          triggerPrice: triggerPriceBigInt.toString(),
          nonce: nonce.toString(),
          expiresAt: expiresAt.toString(),
          signature,
          takeProfit: params.takeProfit, // Pass TP/SL to backend
          stopLoss: params.stopLoss,
          metadata: {
            collateralUsd: params.collateral,
            triggerPriceUsd: params.triggerPrice,
          },
        });

        toast.success(`Limit order submitted! Order #${result.orderId}`);
        const submissionPayload = {
          orderId: result.orderId,
          txHash: result.txHash,
          expiresAt,
          nonce,
        };
        setSubmission(submissionPayload);

        return submissionPayload;
      } catch (err) {
        console.error('❌ Error creating limit open order:', err);
        setError(err as Error);
        toast.error(err instanceof Error ? err.message : 'Failed to create limit order');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets, publicClient],
  );

  return {
    createOrder,
    isPending,
    error,
    submission,
    isSuccess: submission !== null,
  };
}

/**
 * Hook to create a limit close order (take profit)
 */
export function useCreateLimitCloseOrder() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const createOrder = useCallback(
    async (params: CreateLimitCloseParams) => {
      try {
        setIsPending(true);
        setError(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

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

        const triggerPriceBigInt = parseUnits(params.triggerPrice, 8);

        const data = encodeFunctionData({
          abi: LimitExecutorABI,
          functionName: 'createLimitCloseOrder',
          args: [params.positionId, triggerPriceBigInt],
        });

        const gasEstimate = await walletClient.request({
          method: 'eth_estimateGas',
          params: [
            {
              from: address,
              to: LIMIT_EXECUTOR_ADDRESS,
              data,
            },
          ],
        });

        const gasLimit = (BigInt(gasEstimate as string) * 120n) / 100n;

        const txHash = await walletClient.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: LIMIT_EXECUTOR_ADDRESS,
              data,
              gas: '0x' + gasLimit.toString(16),
            },
          ],
        });

        setHash(txHash as `0x${string}`);
        toast.success('Take profit order created!');
      } catch (err) {
        console.error('❌ Error creating limit close order:', err);
        setError(err as Error);
        toast.error('Failed to create take profit order');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    createOrder,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

/**
 * Hook to create a stop loss order
 */
export function useCreateStopLossOrder() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const createOrder = useCallback(
    async (params: CreateStopLossParams) => {
      try {
        setIsPending(true);
        setError(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

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

        const triggerPriceBigInt = parseUnits(params.triggerPrice, 8);

        const data = encodeFunctionData({
          abi: LimitExecutorABI,
          functionName: 'createStopLossOrder',
          args: [params.positionId, triggerPriceBigInt],
        });

        const gasEstimate = await walletClient.request({
          method: 'eth_estimateGas',
          params: [
            {
              from: address,
              to: LIMIT_EXECUTOR_ADDRESS,
              data,
            },
          ],
        });

        const gasLimit = (BigInt(gasEstimate as string) * 120n) / 100n;

        const txHash = await walletClient.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: LIMIT_EXECUTOR_ADDRESS,
              data,
              gas: '0x' + gasLimit.toString(16),
            },
          ],
        });

        setHash(txHash as `0x${string}`);
        toast.success('Stop loss order created!');
      } catch (err) {
        console.error('❌ Error creating stop loss order:', err);
        setError(err as Error);
        toast.error('Failed to create stop loss order');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets],
  );

  return {
    createOrder,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

/**
 * Hook to cancel a pending order
 */
export function useCancelOrder() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
      }),
    [],
  );

  const cancelOrder = useCallback(
    async (orderId: bigint) => {
      try {
        setIsPending(true);
        setError(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        const embeddedWallet = wallets.find(
          (w) => w.walletClientType === 'privy' && w.address === address,
        );

        if (!embeddedWallet) {
          throw new Error('Embedded wallet not found');
        }

        // Get user's current nonce from contract
        const userNonce = (await publicClient.readContract({
          address: LIMIT_EXECUTOR_ADDRESS,
          abi: LimitExecutorABI,
          functionName: 'getUserCurrentNonce',
          args: [address],
        })) as bigint;

        await embeddedWallet.switchChain(baseSepolia.id);
        const walletClient = await embeddedWallet.getEthereumProvider();

        if (!walletClient) {
          throw new Error('Could not get wallet client');
        }

        // Create message to sign: trader, orderId, nonce, contract address, "CANCEL"
        const messageHash = keccak256(
          encodePacked(
            ['address', 'uint256', 'uint256', 'address', 'string'],
            [address, orderId, userNonce, LIMIT_EXECUTOR_ADDRESS, 'CANCEL'],
          ),
        );

        // Sign message
        const signature = (await walletClient.request({
          method: 'personal_sign',
          params: [messageHash, address],
        })) as string;

        // Send to backend for gasless execution
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${backendUrl}/api/relay/cancel-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            orderId: orderId.toString(),
            signature: signature,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to cancel order');
        }

        const result = await response.json();
        const txHash = result.data.txHash;

        setHash(txHash as `0x${string}`);
        toast.success('Order cancelled successfully! (No gas fee)');
      } catch (err) {
        console.error('❌ Error cancelling order:', err);
        setError(err as Error);
        toast.error('Failed to cancel order');
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [address, wallets, publicClient],
  );

  return {
    cancelOrder,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

/**
 * Hook to get all user orders
 */
export function useUserOrders() {
  const { address } = useEmbeddedWallet();

  const {
    data: orderIds,
    isLoading,
    refetch,
  } = useReadContract({
    address: LIMIT_EXECUTOR_ADDRESS,
    abi: LimitExecutorABI,
    functionName: 'getUserOrders',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  return {
    orderIds: (orderIds as bigint[]) || [],
    isLoading,
    refetch,
  };
}

/**
 * Hook to get pending orders for a user
 */
export function useUserPendingOrders() {
  const { address } = useEmbeddedWallet();

  const { data, isLoading, refetch } = useReadContract({
    address: LIMIT_EXECUTOR_ADDRESS,
    abi: LimitExecutorABI,
    functionName: 'getUserPendingOrders',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  const orders = (data as any[]) || [];

  return {
    orders: orders.map((order: any) => ({
      id: order.id || order[0],
      orderType: order.orderType || order[1],
      status: order.status || order[2],
      trader: order.trader || order[3],
      symbol: order.symbol || order[4],
      isLong: order.isLong || order[5],
      collateral: order.collateral || order[6],
      leverage: order.leverage || order[7],
      triggerPrice: order.triggerPrice || order[8],
      positionId: order.positionId || order[9],
      createdAt: order.createdAt || order[10],
      executedAt: order.executedAt || order[11],
      expiresAt: order.expiresAt || order[12],
      nonce: order.nonce || order[13],
    })) as Order[],
    isLoading,
    refetch,
  };
}

/**
 * Hook to get single order details
 */
export function useOrder(orderId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: LIMIT_EXECUTOR_ADDRESS,
    abi: LimitExecutorABI,
    functionName: 'getOrder',
    args: orderId !== undefined ? [orderId] : undefined,
    query: {
      enabled: orderId !== undefined,
      refetchInterval: 5000,
    },
  });

  if (!data) {
    return {
      order: null,
      isLoading,
      refetch,
    };
  }

  const orderData = data as any;
  const order: Order = {
    id: orderData.id || orderData[0],
    orderType: orderData.orderType || orderData[1],
    status: orderData.status || orderData[2],
    trader: orderData.trader || orderData[3],
    symbol: orderData.symbol || orderData[4],
    isLong: orderData.isLong || orderData[5],
    collateral: orderData.collateral || orderData[6],
    leverage: orderData.leverage || orderData[7],
    triggerPrice: orderData.triggerPrice || orderData[8],
    positionId: orderData.positionId || orderData[9],
    createdAt: orderData.createdAt || orderData[10],
    executedAt: orderData.executedAt || orderData[11],
    expiresAt: orderData.expiresAt || orderData[12],
    nonce: orderData.nonce || orderData[13],
  };

  return {
    order,
    isLoading,
    refetch,
  };
}

/**
 * Calculate total cost for creating a limit open order
 */
export function calculateLimitOrderCost(params: {
  collateralUsd: string;
  leverage: number;
  executionFee?: bigint;
  tradingFeeBps?: bigint;
}): {
  collateral: bigint;
  tradingFee: bigint;
  executionFee: bigint;
  totalCost: bigint;
  collateralFormatted: string;
  tradingFeeFormatted: string;
  executionFeeFormatted: string;
  totalCostFormatted: string;
} {
  try {
    const executionFee = params.executionFee ?? 0n;
    if (!params.collateralUsd || Number(params.collateralUsd) <= 0) {
      const formattedExecution = formatUnits(executionFee, USDC_DECIMALS);
      return {
        collateral: 0n,
        tradingFee: 0n,
        executionFee,
        totalCost: executionFee,
        collateralFormatted: '0',
        tradingFeeFormatted: '0',
        executionFeeFormatted: formattedExecution,
        totalCostFormatted: formattedExecution,
      };
    }

    const collateral = parseUnits(params.collateralUsd, USDC_DECIMALS);
    const leverageBigInt = BigInt(Math.max(1, Math.round(params.leverage || 0)));
    const tradingFeeBps = params.tradingFeeBps ?? 5n;
    const positionSize = collateral * leverageBigInt;
    const tradingFee = (positionSize * tradingFeeBps) / 10000n;
    const totalCost = collateral + tradingFee + executionFee;
    const format = (value: bigint) => formatUnits(value, USDC_DECIMALS);

    return {
      collateral,
      tradingFee,
      executionFee,
      totalCost,
      collateralFormatted: format(collateral),
      tradingFeeFormatted: format(tradingFee),
      executionFeeFormatted: format(executionFee),
      totalCostFormatted: format(totalCost),
    };
  } catch (error) {
    console.error('Error calculating limit order cost:', error);
    const executionFeeFormatted = formatUnits(params.executionFee ?? 0n, USDC_DECIMALS);
    return {
      collateral: 0n,
      tradingFee: 0n,
      executionFee: params.executionFee ?? 0n,
      totalCost: params.executionFee ?? 0n,
      collateralFormatted: '0',
      tradingFeeFormatted: '0',
      executionFeeFormatted,
      totalCostFormatted: executionFeeFormatted,
    };
  }
}
