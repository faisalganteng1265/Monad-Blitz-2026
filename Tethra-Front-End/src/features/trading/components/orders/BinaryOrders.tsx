'use client';

import { useState, useEffect } from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { calculateMultiplier } from '@/components/charts/PerSecondChart/utils';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface BinaryOrder {
  betId: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  betAmount: string;
  targetPrice: string;
  entryPrice: string;
  entryTime: number;
  targetTime: number;
  multiplier: number;
  status: 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED';
  settledAt?: number;
  settlePrice?: string;
  createdAt: number;
}

const BinaryOrders = () => {
  const [orders, setOrders] = useState<BinaryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { address } = useEmbeddedWallet();

  useEffect(() => {
    const fetchOrders = async () => {
      if (!address) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const url = `${BACKEND_URL}/api/one-tap/bets?trader=${address}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.data) {
            // Transform backend data to component format
            const transformedOrders = data.data.map((bet: any) => {
              const entryPrice = parseFloat(bet.entryPrice) / 100000000; // 8 decimals
              const targetPrice = parseFloat(bet.targetPrice) / 100000000; // 8 decimals
              const direction = targetPrice > entryPrice ? 'UP' : 'DOWN';

              return {
                ...bet,
                direction,
              };
            });
            setOrders(transformedOrders);
          } else {
            setOrders([]);
          }
        } else {
          setOrders([]);
        }
      } catch (error) {
        console.error('❌ Error fetching binary orders:', error);
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();

    // Poll every 3 seconds to get updates
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [address]);

  // Get crypto icon based on symbol
  const getCryptoIcon = (symbol: string) => {
    const icons: { [key: string]: string } = {
      BTC: '₿',
      ETH: 'Ξ',
      SOL: '◎',
      AVAX: '🔺',
      MATIC: '🟣',
      ARB: '🔵',
      OP: '🔴',
    };
    return icons[symbol] || '💎';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WON':
        return 'text-green-400 bg-green-400/10';
      case 'LOST':
        return 'text-red-400 bg-red-400/10';
      case 'ACTIVE':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'CANCELLED':
        return 'text-gray-400 bg-gray-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getDirectionColor = (direction: string) => {
    return direction === 'UP' ? 'text-green-400' : 'text-red-400';
  };

  if (isLoading) {
    return <div className="text-center py-16 text-gray-500">Loading binary orders...</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase">
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left font-medium">MARKET</th>
              <th className="px-4 py-3 text-left font-medium">BET AMOUNT</th>
              <th className="px-4 py-3 text-left font-medium">MULTIPLIER</th>
              <th className="px-4 py-3 text-left font-medium">STATUS</th>
              <th className="px-4 py-3 text-left font-medium">TIME</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-700">
              <td colSpan={5} className="text-center py-16 text-gray-500">
                No binary orders. Place a bet in One Tap Profit mode to see orders here.
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
            <th className="px-4 py-3 text-left font-medium">MARKET</th>
            <th className="px-4 py-3 text-left font-medium">BET AMOUNT</th>
            <th className="px-4 py-3 text-left font-medium">MULTIPLIER</th>
            <th className="px-4 py-3 text-left font-medium">STATUS</th>
            <th className="px-4 py-3 text-left font-medium">TIME</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            // Parse bet amount - backend already sends in decimal format (not wei)
            let betAmount = 0;
            if (typeof order.betAmount === 'string') {
              const parsed = parseFloat(order.betAmount);
              betAmount = isNaN(parsed) ? 0 : parsed;
            } else if (typeof order.betAmount === 'number') {
              betAmount = order.betAmount;
            }

            // Parse prices for calculation
            const entryPriceNum = parseFloat(order.entryPrice) / 100000000;
            const targetPriceNum = parseFloat(order.targetPrice) / 100000000;

            // Recalculate multiplier using frontend utility
            const displayMultiplier = calculateMultiplier(
              entryPriceNum,
              targetPriceNum,
              order.entryTime,
              order.targetTime,
            );

            return (
              <tr
                key={order.betId}
                className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                {/* Market */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-lg">
                      {getCryptoIcon(order.symbol)}
                    </div>
                    <span className="font-semibold text-white">
                      {formatMarketPair(order.symbol)}
                    </span>
                  </div>
                </td>

                {/* Bet Amount */}
                <td className="px-4 py-3">
                  <span className="text-white font-medium">
                    ${betAmount > 0 ? betAmount.toFixed(2) : '0.00'}
                  </span>
                </td>

                {/* Multiplier */}
                <td className="px-4 py-3">
                  <span className="text-blue-300 font-bold">
                    {(displayMultiplier / 100).toFixed(2)}x
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(
                      order.status,
                    )}`}
                  >
                    {order.status}
                  </span>
                </td>

                {/* Time */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-gray-400 text-xs">
                      {new Date(order.createdAt * 1000).toLocaleTimeString()}
                    </span>
                    {order.status === 'ACTIVE' && (
                      <span className="text-yellow-400 text-xs">
                        Expires: {new Date(order.targetTime * 1000).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BinaryOrders;
