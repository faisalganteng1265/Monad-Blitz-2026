import React from 'react';
import { formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { ALL_MARKETS } from '@/features/trading/constants/markets';

// Type definitions reuse
// Since we are not strictly importing types from hooks due to inline types in hooks,
// we'll define a flexible interface compatible with both.
interface MobileOpenOrderCardProps {
  order: any; // Using any for flexibility or we can define strict union type
  type: 'LIMIT' | 'TAP';
  onCancel: (id: any) => void;
  isCancelling?: boolean;
}

const MobileOpenOrderCard = ({ order, type, onCancel, isCancelling }: MobileOpenOrderCardProps) => {
  // Helper to get logo URL
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  const isLimit = type === 'LIMIT';
  const triggerPrice = parseFloat(formatUnits(order.triggerPrice, 8));
  const collateral = parseFloat(formatUnits(order.collateral, 6));
  const createdDate = isLimit
    ? new Date(Number(order.createdAt) * 1000)
    : new Date(order.startTime * 1000);

  return (
    <div className="bg-[#131B26] p-4 rounded-lg border border-gray-800 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={getLogoUrl(order.symbol)}
            alt={order.symbol}
            className="w-8 h-8 rounded-full bg-slate-800"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">
                {formatMarketPair(order.symbol)}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isLimit ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                }`}
              >
                {type}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs font-bold ${order.isLong ? 'text-green-400' : 'text-red-400'}`}
              >
                {order.isLong ? 'Long' : 'Short'}
              </span>
              <span className="text-xs text-gray-400">• {order.leverage}x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid-cols-2 gap-4 text-xs flex flex-col">
        <div>
          <div className="flex justify-between">
            <span className="text-gray-500">Trigger Price</span>
            <span className="text-white font-mono">${triggerPrice.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Collateral</span>
            <span className="text-white font-mono">${collateral.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Time</span>
          <span className="text-gray-400">{createdDate.toLocaleString()}</span>
        </div>
      </div>

      {/* Action */}
      <Button
        variant="destructive"
        size="sm"
        className="w-full mt-2 text-xs h-8"
        onClick={() => onCancel(order.id)}
        disabled={isCancelling}
      >
        {isCancelling ? 'Cancelling...' : 'Cancel Order'}
      </Button>
    </div>
  );
};

export default MobileOpenOrderCard;
