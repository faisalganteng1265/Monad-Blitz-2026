import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { keccak256, encodePacked, encodeFunctionData } from 'viem';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export interface ClickedCell {
  cellX: number;
  cellY: number;
  clickCount: number;
  triggerPrice: string; // 8 decimals
  startTime: number; // unix timestamp
  endTime: number; // unix timestamp
  isLong: boolean;
}

export interface TapToTradeOrder {
  id: string;
  gridSessionId: string;
  cellId: string;
  trader: string;
  symbol: string;
  isLong: boolean;
  collateral: string;
  leverage: number;
  triggerPrice: string;
  startTime: number;
  endTime: number;
  nonce: string;
  signature: string;
  status: 'PENDING' | 'EXECUTING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  createdAt: number;
  txHash?: string;
  positionId?: string;
  executionPrice?: string;
  errorMessage?: string;
}

export function useTapToTrade() {
  const { address } = useEmbeddedWallet();
  const { wallets } = useWallets();
  const [clickedCells, setClickedCells] = useState<ClickedCell[]>([]);
  const [pendingOrders, setPendingOrders] = useState<TapToTradeOrder[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle grid cell click
   * Calculates trigger price and time window
   */
  const handleCellClick = useCallback(
    (
      cellX: number,
      cellY: number,
      referencePrice: number,
      referenceTime: number,
      timeframeSeconds: number,
      gridSizeX: number,
      gridSizeYPercent: number,
    ) => {
      // Calculate trigger price from cellY
      const percentPerCell = gridSizeYPercent / 10000; // 50 → 0.005 (0.5%)
      const priceChange = referencePrice * percentPerCell * cellY;
      const triggerPrice = referencePrice + priceChange;
      const triggerPriceWith8Decimals = Math.round(triggerPrice * 100000000).toString();

      // Calculate time window from cellX
      const startTime = referenceTime + cellX * timeframeSeconds;
      const endTime = startTime + gridSizeX * timeframeSeconds;

      // Determine direction (above reference = long, below = short)
      const isLong = cellY > 0;

      // Check if cell already clicked
      const existingCell = clickedCells.find((c) => c.cellX === cellX && c.cellY === cellY);

      if (existingCell) {
        // Increment click count
        setClickedCells((prev) =>
          prev.map((c) =>
            c.cellX === cellX && c.cellY === cellY ? { ...c, clickCount: c.clickCount + 1 } : c,
          ),
        );
      } else {
        // Add new cell
        setClickedCells((prev) => [
          ...prev,
          {
            cellX,
            cellY,
            clickCount: 1,
            triggerPrice: triggerPriceWith8Decimals,
            startTime,
            endTime,
            isLong,
          },
        ]);
      }
    },
    [clickedCells],
  );

  /**
   * Clear all clicked cells
   */
  const clearClickedCells = useCallback(() => {
    setClickedCells([]);
  }, []);

  /**
   * Sign order for MarketExecutor meta-transaction
   */
  const signMarketOrder = async (
    trader: string,
    symbol: string,
    isLong: boolean,
    collateral: string,
    leverage: number,
    marketExecutorAddress: string,
  ): Promise<{ signature: string; nonce: string } | null> => {
    try {
      // Find embedded wallet - try multiple approaches

      let embeddedWallet = wallets.find(
        (w) => w.walletClientType === 'privy' && w.address?.toLowerCase() === trader?.toLowerCase(),
      );

      // Fallback: just get the first privy wallet
      if (!embeddedWallet) {
        embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
      }

      if (!embeddedWallet) {
        console.error('❌ No embedded wallet found in wallets array');
        throw new Error('Embedded wallet not found. Please ensure Privy wallet is connected.');
      }

      // Get wallet provider (EIP-1193)
      const walletClient = await embeddedWallet.getEthereumProvider();
      if (!walletClient) {
        throw new Error('Could not get wallet client');
      }

      // Get current nonce from contract via eth_call
      const MarketExecutorABI = [
        {
          inputs: [{ name: '', type: 'address' }],
          name: 'metaNonces',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ];

      const nonceData = encodeFunctionData({
        abi: MarketExecutorABI,
        functionName: 'metaNonces',
        args: [trader as `0x${string}`],
      });

      const nonceResult = await walletClient.request({
        method: 'eth_call',
        params: [
          {
            to: marketExecutorAddress,
            data: nonceData,
          },
          'latest',
        ],
      });

      const metaNonce = BigInt(nonceResult as string);

      // Create message hash (must match MarketExecutor.sol format)
      const messageHash = keccak256(
        encodePacked(
          ['address', 'string', 'bool', 'uint256', 'uint256', 'uint256', 'address'],
          [
            trader as `0x${string}`,
            symbol,
            isLong,
            BigInt(collateral),
            BigInt(leverage),
            metaNonce,
            marketExecutorAddress as `0x${string}`,
          ],
        ),
      );

      // Sign message using personal_sign (same as market/limit orders)
      const signature = await walletClient.request({
        method: 'personal_sign',
        params: [messageHash, trader],
      });

      return {
        signature: signature as string,
        nonce: metaNonce.toString(),
      };
    } catch (err: any) {
      console.error('Failed to sign order:', err);
      setError(err.message || 'Failed to sign order');
      return null;
    }
  };

  /**
   * Submit tap-to-trade orders to backend
   */
  const submitOrders = async (
    gridSessionId: string,
    symbol: string,
    leverage: number,
    marginTotal: string,
    marketExecutorAddress: string,
  ): Promise<boolean> => {
    if (!address) {
      setError('Wallet not connected');
      return false;
    }

    if (clickedCells.length === 0) {
      setError('No cells clicked');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Calculate collateral per order
      const totalClicks = clickedCells.reduce((sum, cell) => sum + cell.clickCount, 0);
      const collateralPerOrder = Math.floor(parseFloat(marginTotal) / totalClicks).toString();

      // Sign each order
      const orders = [];

      for (const cell of clickedCells) {
        for (let i = 0; i < cell.clickCount; i++) {
          const signResult = await signMarketOrder(
            address,
            symbol,
            cell.isLong,
            collateralPerOrder,
            leverage,
            marketExecutorAddress,
          );

          if (!signResult) {
            throw new Error('Failed to sign order');
          }

          orders.push({
            gridSessionId,
            cellId: `cell_${cell.cellX}_${cell.cellY}`,
            trader: address,
            symbol,
            isLong: cell.isLong,
            collateral: collateralPerOrder,
            leverage,
            triggerPrice: cell.triggerPrice,
            startTime: cell.startTime,
            endTime: cell.endTime,
            nonce: signResult.nonce,
            signature: signResult.signature,
          });
        }
      }

      // Submit to backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/tap-to-trade/batch-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gridSessionId,
          orders,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit orders');
      }

      // Clear clicked cells
      setClickedCells([]);

      // Refresh pending orders
      await fetchPendingOrders();

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to submit orders');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Fetch pending orders from backend
   */
  const fetchPendingOrders = async (): Promise<void> => {
    if (!address) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(
        `${backendUrl}/api/tap-to-trade/orders?trader=${address}&status=PENDING`,
      );

      const result = await response.json();

      if (result.success) {
        setPendingOrders(result.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch pending orders:', err);
    }
  };

  /**
   * Cancel single order
   */
  const cancelOrder = async (orderId: string): Promise<boolean> => {
    if (!address) return false;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/tap-to-trade/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          trader: address,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel order');
      }

      // Refresh pending orders
      await fetchPendingOrders();

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
      return false;
    }
  };

  /**
   * Cancel all orders in a cell
   */
  const cancelCell = async (cellId: string): Promise<boolean> => {
    if (!address) return false;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/tap-to-trade/cancel-cell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cellId,
          trader: address,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel cell');
      }

      // Refresh pending orders
      await fetchPendingOrders();

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to cancel cell');
      return false;
    }
  };

  return {
    clickedCells,
    pendingOrders,
    isSubmitting,
    error,
    handleCellClick,
    clearClickedCells,
    submitOrders,
    fetchPendingOrders,
    cancelOrder,
    cancelCell,
  };
}
