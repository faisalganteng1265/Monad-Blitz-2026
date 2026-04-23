'use client';

import { useState, useEffect } from 'react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface TapToTradeOrder {
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
  updatedAt: number;
  executedAt?: number;
  executedTxHash?: string;
  failureReason?: string;
}

const TapToTradeOrders = () => {
  const { address } = useEmbeddedWallet();
  const { gridSession } = useTapToTrade();
  const [orders, setOrders] = useState<TapToTradeOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set());

  // Fetch orders from backend
  const fetchOrders = async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/tap-to-trade/orders?trader=${address}`);
      const result = await response.json();

      if (result.success) {
        setOrders(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch tap-to-trade orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll orders every 5 seconds
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [address]);

  // Cancel single order
  const cancelOrder = async (orderId: string) => {
    if (!address) return;

    setCancellingOrders(prev => new Set(prev).add(orderId));
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/tap-to-trade/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, trader: address }),
      });

      const result = await response.json();
      if (result.success) {
        await fetchOrders(); // Refresh orders
      }
    } catch (error) {
      console.error('Failed to cancel order:', error);
    } finally {
      setCancellingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };


  // Cancel all orders
  const cancelAllOrders = async () => {
    if (!address || !gridSession) return;

    const allOrderIds = orders.filter(o => o.status === 'PENDING').map(o => o.id);
    allOrderIds.forEach(id => setCancellingOrders(prev => new Set(prev).add(id)));

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/tap-to-trade/cancel-grid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gridSessionId: gridSession.id,
          trader: address
        }),
      });

      const result = await response.json();
      if (result.success) {
        await fetchOrders(); // Refresh orders
      }
    } catch (error) {
      console.error('Failed to cancel all orders:', error);
    } finally {
      allOrderIds.forEach(id => {
        setCancellingOrders(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      });
    }
  };

  // Format price with 2 decimals
  const formatPrice = (price: string) => {
    return (parseFloat(price) / 100000000).toFixed(2);
  };

  // Calculate and format price range based on grid cell
  const formatPriceRange = (order: TapToTradeOrder) => {
    if (!gridSession) {
      return `$${formatPrice(order.triggerPrice)}`;
    }

    const triggerPrice = parseFloat(order.triggerPrice) / 100000000;
    const gridSizeYPercent = gridSession.gridSizeYPercent / 100; // Convert from basis points to %
    const referencePrice = parseFloat(gridSession.referencePrice) / 100000000;

    // Calculate half step (since trigger is center of range)
    const halfStep = (gridSizeYPercent / 100) * referencePrice / 2;

    const minPrice = triggerPrice - halfStep;
    const maxPrice = triggerPrice + halfStep;

    return `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`;
  };

  // Format collateral with 2 decimals
  const formatCollateral = (collateral: string) => {
    return (parseFloat(collateral) / 1000000).toFixed(2);
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'text-yellow-400';
      case 'EXECUTING': return 'text-blue-400';
      case 'EXECUTED': return 'text-green-400';
      case 'CANCELLED': return 'text-gray-400';
      case 'EXPIRED': return 'text-orange-400';
      case 'FAILED': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  // Group orders by cell
  const ordersByCell = orders.reduce((acc, order) => {
    if (!acc[order.cellId]) {
      acc[order.cellId] = [];
    }
    acc[order.cellId].push(order);
    return acc;
  }, {} as Record<string, TapToTradeOrder[]>);

  const pendingOrders = orders.filter(o => o.status === 'PENDING');

  if (isLoading && orders.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        Loading tap-to-trade orders...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>No tap-to-trade orders found.</p>
        <p className="text-sm mt-2">Enable Tap-to-Trade mode and click grid cells to create orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {pendingOrders.length > 0 && (
        <div className="flex justify-end gap-2 px-4 pt-4">
          <button
            onClick={cancelAllOrders}
            disabled={cancellingOrders.size > 0}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel All ({pendingOrders.length})
          </button>
        </div>
      )}

      {/* Orders table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Cell</th>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Trigger Price</th>
              <th className="px-4 py-3 font-medium">Collateral</th>
              <th className="px-4 py-3 font-medium">Leverage</th>
              <th className="px-4 py-3 font-medium">Time Window</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                <td className="px-4 py-3 text-white font-mono text-xs">
                  {order.cellId}
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  {order.symbol}
                </td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${order.isLong ? 'text-green-400' : 'text-red-400'}`}>
                    {order.isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td className="px-4 py-3 text-white font-mono text-sm">
                  {formatPriceRange(order)}
                </td>
                <td className="px-4 py-3 text-white">
                  ${formatCollateral(order.collateral)}
                </td>
                <td className="px-4 py-3 text-white">
                  {order.leverage}x
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  <div>{formatTime(order.startTime)}</div>
                  <div>to {formatTime(order.endTime)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {order.status === 'PENDING' && (
                    <button
                      onClick={() => cancelOrder(order.id)}
                      disabled={cancellingOrders.has(order.id)}
                      className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {cancellingOrders.has(order.id) ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                  {order.status === 'EXECUTED' && order.executedTxHash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${order.executedTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs underline"
                    >
                      View Tx
                    </a>
                  )}
                  {order.status === 'FAILED' && order.failureReason && (
                    <span className="text-red-400 text-xs" title={order.failureReason}>
                      Failed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TapToTradeOrders;
