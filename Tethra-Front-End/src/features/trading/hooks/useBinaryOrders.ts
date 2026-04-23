import { useState, useEffect } from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface BinaryOrder {
  betId: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  betAmount: string | number;
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

export function useBinaryOrders() {
  const [orders, setOrders] = useState<BinaryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { address } = useEmbeddedWallet();

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

  useEffect(() => {
    fetchOrders();

    // Poll every 3 seconds to get updates
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [address]);

  return {
    orders,
    isLoading,
    refetch: fetchOrders,
  };
}
