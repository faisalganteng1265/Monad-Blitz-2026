import React from 'react';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { calculateMultiplier } from '@/components/charts/PerSecondChart/utils';
import { ALL_MARKETS } from '@/features/trading/constants/markets';

interface MobileHistoryCardProps {
  item: any;
}

const MobileHistoryCard = ({ item }: MobileHistoryCardProps) => {
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  const isTap = item.type === 'TAP';
  const date = new Date(item.time * 1000);

  let resultDisplay = '-';
  let statusColor = 'text-gray-400';
  let betMarginDisplay = '-';

  // Status Logic
  if (['WON', 'EXECUTED'].includes(item.status)) statusColor = 'text-green-400';
  else if (['LOST', 'FAILED'].includes(item.status)) statusColor = 'text-red-400';
  else if (['CANCELLED', 'EXPIRED'].includes(item.status)) statusColor = 'text-orange-400';

  if (isTap) {
    let amount = 0;
    if (typeof item.collateral === 'string') amount = parseFloat(item.collateral) / 1000000;
    else if (typeof item.collateral === 'bigint') amount = Number(item.collateral) / 1000000;
    else if (typeof item.collateral === 'number') amount = item.collateral / 1000000;
    betMarginDisplay = `$${amount.toFixed(2)}`;

    if (item.status === 'EXECUTED' && item.executedTxHash) {
      resultDisplay = 'View Tx';
    }
  } else {
    let amount = 0;
    if (typeof item.betAmount === 'string') amount = parseFloat(item.betAmount);
    else if (typeof item.betAmount === 'number') amount = item.betAmount;
    betMarginDisplay = `$${amount.toFixed(2)}`;

    const entry = parseFloat(item.entryPrice) / 100000000;
    const target = parseFloat(item.targetPrice) / 100000000;
    const mult = calculateMultiplier(entry, target, item.entryTime, item.targetTime);
    const multDisplay = (mult / 100).toFixed(2);

    if (item.status === 'WON') {
      const payout = amount * (mult / 100);
      const profit = payout - amount;
      resultDisplay = `+$${profit.toFixed(2)} (${multDisplay}x)`;
    } else if (item.status === 'LOST') {
      resultDisplay = `-$${amount.toFixed(2)}`;
    }
  }

  return (
    <div className="bg-[#131B26] p-4 rounded-lg border border-gray-800 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={getLogoUrl(item.symbol)}
            alt={item.symbol}
            className="w-8 h-8 rounded-full bg-slate-800"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div>
            <span className="font-bold text-white text-base block">
              {formatMarketPair(item.symbol)}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isTap ? 'bg-purple-500/10 text-purple-400' : 'bg-orange-500/10 text-orange-400'
              }`}
            >
              {isTap ? 'OPEN POS' : '1-TAP'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold ${statusColor}`}>{item.status}</div>
          <div className="text-xs text-gray-500">{date.toLocaleTimeString()}</div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-800 pt-3">
        <div className="flex justify-between">
          <span className="text-gray-500">Margin/Bet</span>
          <span className="text-white font-medium">{betMarginDisplay}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Result</span>
          <span
            className={`${
              item.status === 'WON'
                ? 'text-green-400'
                : item.status === 'LOST'
                  ? 'text-red-400'
                  : 'text-gray-400'
            } font-medium`}
          >
            {resultDisplay === 'View Tx' ? (
              <a
                href={`https://sepolia.basescan.org/tx/${item.executedTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 underline"
              >
                Tx
              </a>
            ) : (
              resultDisplay
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MobileHistoryCard;
