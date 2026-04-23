import { useState } from 'react';
import {
  useUserPendingOrders,
  useCancelOrder,
  OrderType,
} from '@/features/trading/hooks/useLimitOrder';
import { useTapToTradeOrders, TapToTradeOrder } from '@/features/trading/hooks/useTapToTradeOrders';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { formatUnits } from 'viem';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import MobileOpenOrderCard from './MobileOpenOrderCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function OpenOrdersTab() {
  // Limit Orders Data
  const {
    orders: limitOrders,
    isLoading: isLoadingLimit,
    refetch: refetchLimit,
  } = useUserPendingOrders();
  const { cancelOrder: cancelLimitOrder, isPending: isCancellingLimit } = useCancelOrder();

  // Tap Orders Data
  const {
    orders: tapOrders,
    isLoading: isLoadingTap,
    cancelOrder: cancelTapOrder,
    cancellingOrders,
    cancelAllOrders: cancelAllTap,
  } = useTapToTradeOrders();

  // Filter for ONLY pending tap orders
  const pendingTapOrders = tapOrders.filter((o) => o.status === 'PENDING');

  const isLoading = isLoadingLimit || isLoadingTap;

  const handleCancelLimit = async (orderId: bigint) => {
    try {
      toast.loading('Cancelling order...', { id: 'cancel-limit' });
      await cancelLimitOrder(orderId);
      toast.success('Order cancelled!', { id: 'cancel-limit' });
      setTimeout(() => refetchLimit(), 1000);
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order', { id: 'cancel-limit' });
    }
  };

  const handleCancelTap = async (orderId: string) => {
    await cancelTapOrder(orderId);
  };

  // Helper to get logo URL
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  if (isLoading && limitOrders.length === 0 && tapOrders.length === 0) {
    return <div className="text-center py-16 text-gray-500">Loading open orders...</div>;
  }

  if (limitOrders.length === 0 && pendingTapOrders.length === 0) {
    return <div className="text-center py-16 text-gray-500">No open orders found.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Actions Bar */}
      <div className="flex justify-end p-2 border-b border-gray-800/50">
        {pendingTapOrders.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={cancelAllTap}
            className="h-7 text-xs font-bold"
          >
            Cancel All Tap Orders
          </Button>
        )}
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#0B1017] sticky top-0 z-10">
            <TableRow className="border-b border-gray-800 hover:bg-transparent">
              <TableHead className="font-medium">Type</TableHead>
              <TableHead className="font-medium">Symbol</TableHead>
              <TableHead className="font-medium">Side</TableHead>
              <TableHead className="text-right font-medium">Trigger Price</TableHead>
              <TableHead className="text-right font-medium">Size/Collateral</TableHead>
              <TableHead className="text-right font-medium">Leverage</TableHead>
              <TableHead className="text-right font-medium">Time</TableHead>
              <TableHead className="text-right font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Limit Orders */}
            {limitOrders.map((order) => {
              const triggerPrice = parseFloat(formatUnits(order.triggerPrice, 8));
              const collateral = parseFloat(formatUnits(order.collateral, 6));
              const createdDate = new Date(Number(order.createdAt) * 1000);

              return (
                <TableRow
                  key={`limit-${order.id.toString()}`}
                  className="hover:bg-gray-800/30 transition-colors group border-gray-800/50"
                >
                  <TableCell>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400">
                      LIMIT
                    </span>
                  </TableCell>
                  <TableCell className="text-white font-medium">
                    <div className="flex items-center gap-2">
                      <img
                        src={getLogoUrl(order.symbol)}
                        alt={order.symbol}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
                        }}
                      />
                      {formatMarketPair(order.symbol)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-medium ${order.isLong ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {order.isLong ? 'Long' : 'Short'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    $
                    {triggerPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    ${collateral.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    {order.leverage}x
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-500">
                    {createdDate.toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handleCancelLimit(order.id)}
                      disabled={isCancellingLimit}
                      className="text-red-500 hover:text-red-400 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {isCancellingLimit ? '...' : 'Cancel'}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Tap Orders */}
            {pendingTapOrders.map((order) => {
              const trigger = parseFloat(order.triggerPrice) / 100000000;
              const collateral = parseFloat(order.collateral) / 1000000;
              const startTime = new Date(order.startTime * 1000);

              return (
                <TableRow
                  key={`tap-${order.id}`}
                  className="hover:bg-gray-800/30 transition-colors group border-gray-800/50"
                >
                  <TableCell>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">
                      TAP
                    </span>
                  </TableCell>
                  <TableCell className="text-white font-medium">
                    <div className="flex items-center gap-2">
                      <img
                        src={getLogoUrl(order.symbol)}
                        alt={order.symbol}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
                        }}
                      />
                      {order.symbol}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-medium ${order.isLong ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {order.isLong ? 'Long' : 'Short'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    $
                    {trigger.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    ${collateral.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-white font-mono">
                    {order.leverage}x
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-500">
                    {startTime.toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handleCancelTap(order.id)}
                      disabled={cancellingOrders.has(order.id)}
                      className="text-red-500 hover:text-red-400 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {cancellingOrders.has(order.id) ? '...' : 'Cancel'}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4 p-4 overflow-y-auto flex-1">
        {/* Limit Orders Cards */}
        {limitOrders.map((order) => (
          <MobileOpenOrderCard
            key={`limit-card-${order.id.toString()}`}
            order={order}
            type="LIMIT"
            onCancel={handleCancelLimit}
            isCancelling={isCancellingLimit}
          />
        ))}

        {/* Tap Orders Cards */}
        {pendingTapOrders.map((order) => (
          <MobileOpenOrderCard
            key={`tap-card-${order.id}`}
            order={order}
            type="TAP"
            onCancel={handleCancelTap}
            isCancelling={cancellingOrders.has(order.id)}
          />
        ))}
      </div>
    </div>
  );
}
