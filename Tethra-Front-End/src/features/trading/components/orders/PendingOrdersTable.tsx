'use client';

import {
  useUserPendingOrders,
  useCancelOrder,
  OrderType,
} from '@/features/trading/hooks/useLimitOrder';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { formatUnits } from 'viem';
import { toast } from 'sonner';

const PendingOrdersTable = () => {
  const { orders, isLoading, refetch } = useUserPendingOrders();
  const { cancelOrder, isPending: isCancelling } = useCancelOrder();

  const handleCancelOrder = async (orderId: bigint) => {
    try {
      toast.loading('Cancelling order...', { id: 'cancel-order' });
      await cancelOrder(orderId);
      toast.success('Order cancelled!', { id: 'cancel-order' });
      // Refetch orders after 1 second
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order', { id: 'cancel-order' });
    }
  };

  if (isLoading) {
    return <div className="text-center py-16 text-gray-500">Loading orders...</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase">
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left font-medium">SYMBOL</th>
              <th className="px-4 py-3 text-left font-medium">DIRECTION</th>
              <th className="px-4 py-3 text-left font-medium">TRIGGER PRICE</th>
              <th className="px-4 py-3 text-left font-medium">COLLATERAL</th>
              <th className="px-4 py-3 text-left font-medium">LEVERAGE</th>
              <th className="px-4 py-3 text-left font-medium">CREATED</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-700">
              <td colSpan={8} className="text-center py-16 text-gray-500">
                No pending orders
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-400">
        <thead className="text-xs text-gray-500 uppercase">
          <tr className="border-b border-gray-800">
            <th className="px-4 py-3 text-left font-medium">SYMBOL</th>
            <th className="px-4 py-3 text-left font-medium">DIRECTION</th>
            <th className="px-4 py-3 text-left font-medium">TRIGGER PRICE</th>
            <th className="px-4 py-3 text-left font-medium">COLLATERAL</th>
            <th className="px-4 py-3 text-left font-medium">LEVERAGE</th>
            <th className="px-4 py-3 text-left font-medium">CREATED</th>
            <th className="px-4 py-3 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const triggerPrice = parseFloat(formatUnits(order.triggerPrice, 8));
            // Show collateral and leverage for ALL order types for debugging
            const collateral = parseFloat(formatUnits(order.collateral, 6));
            const leverage = Number(order.leverage);
            const createdDate = new Date(Number(order.createdAt) * 1000);

            const orderTypeLabel =
              order.orderType === OrderType.LIMIT_OPEN
                ? 'Limit'
                : order.orderType === OrderType.LIMIT_CLOSE
                ? 'Take Profit'
                : 'Stop Loss';

            const orderTypeColor =
              order.orderType === OrderType.LIMIT_OPEN
                ? 'text-blue-400'
                : order.orderType === OrderType.LIMIT_CLOSE
                ? 'text-green-400'
                : 'text-red-400';

            return (
              <tr
                key={order.id.toString()}
                className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                {/* Symbol */}
                <td className="px-4 py-3">
                  <span className="text-white font-medium">{formatMarketPair(order.symbol)}</span>
                </td>

                {/* Direction */}
                <td className="px-4 py-3">
                  <span
                    className={`font-medium ${order.isLong ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {order.isLong ? 'Long' : 'Short'}
                  </span>
                </td>

                {/* Trigger Price */}
                <td className="px-4 py-3">
                  <span className="text-white">
                    $
                    {triggerPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </td>

                {/* Collateral */}
                <td className="px-4 py-3">
                  {collateral > 0 ? (
                    <span className="text-white">${collateral.toFixed(2)}</span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>

                {/* Leverage */}
                <td className="px-4 py-3">
                  {leverage > 0 ? (
                    <span className="text-white">{leverage}x</span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>

                {/* Created */}
                <td className="px-4 py-3">
                  <span className="text-gray-400 text-xs">
                    {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString()}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleCancelOrder(order.id)}
                    disabled={isCancelling}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PendingOrdersTable;
