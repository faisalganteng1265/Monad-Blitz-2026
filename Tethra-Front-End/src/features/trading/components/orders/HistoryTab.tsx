import { useState } from 'react';
import { useTapToTradeOrders } from '@/features/trading/hooks/useTapToTradeOrders';
import { useBinaryOrders } from '@/features/trading/hooks/useBinaryOrders';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { calculateMultiplier } from '@/components/charts/PerSecondChart/utils';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import MobileHistoryCard from './MobileHistoryCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function HistoryTab() {
  const { orders: tapOrders, isLoading: isLoadingTap } = useTapToTradeOrders();
  const { orders: binaryOrders, isLoading: isLoadingBinary } = useBinaryOrders();

  const [filter, setFilter] = useState<'ALL' | 'TAP' | 'BINARY'>('ALL');

  // Filter Tap Orders (Executed, Cancelled, Expired, Failed)
  const tapHistory = tapOrders.filter((o) =>
    ['EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(o.status),
  );

  // Filter Binary Orders (Won, Lost, Cancelled)
  const binaryHistory = binaryOrders.filter((o) => ['WON', 'LOST', 'CANCELLED'].includes(o.status));

  const isLoading = isLoadingTap || isLoadingBinary;

  // Helper to get logo URL
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  if (isLoading && tapHistory.length === 0 && binaryHistory.length === 0) {
    return <div className="text-center py-16 text-gray-500">Loading history...</div>;
  }

  if (tapHistory.length === 0 && binaryHistory.length === 0) {
    return <div className="text-center py-16 text-gray-500">No history found.</div>;
  }

  // Combine and Sort by Created Date (Desc)
  const combinedHistory = [
    ...tapHistory.map((o) => ({ ...o, type: 'TAP', time: o.createdAt })),
    ...binaryHistory.map((o) => ({ ...o, type: 'BINARY', time: o.createdAt })),
  ].sort((a, b) => b.time - a.time);

  const filteredHistory =
    filter === 'ALL' ? combinedHistory : combinedHistory.filter((o) => o.type === filter);

  return (
    <div className="h-full flex flex-col">
      {/* Filter Bar */}
      <div className="flex gap-4 p-4 border-b border-gray-800/50 overflow-x-auto no-scrollbar items-center">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-4 py-2 text-sm rounded-lg font-bold transition-all shrink-0 ${
            filter === 'ALL'
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          All History
        </button>
        <button
          onClick={() => setFilter('BINARY')}
          className={`px-4 py-2 text-sm rounded-lg font-bold transition-all shrink-0 ${
            filter === 'BINARY'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          One Tap Profit
        </button>
        <button
          onClick={() => setFilter('TAP')}
          className={`px-4 py-2 text-sm rounded-lg font-bold transition-all shrink-0 ${
            filter === 'TAP'
              ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          Open Position
        </button>
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#0B1017] sticky top-0 z-10">
            <TableRow className="border-b border-gray-800 hover:bg-transparent">
              <TableHead className="font-medium">Type</TableHead>
              <TableHead className="font-medium">Symbol</TableHead>
              <TableHead className="text-right font-medium">Bet Margin</TableHead>
              <TableHead className="text-right font-medium">Result (Win)</TableHead>
              <TableHead className="text-right font-medium">Status</TableHead>
              <TableHead className="text-right font-medium">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHistory.map((item: any) => {
              const isTap = item.type === 'TAP';
              const date = new Date(item.time * 1000);

              let resultDisplay = '-';
              let statusColor = 'text-gray-400';

              // Bet Margin / Size
              let betMarginDisplay = '-';

              // Status Color Logic
              if (['WON', 'EXECUTED'].includes(item.status)) statusColor = 'text-green-400';
              else if (['LOST', 'FAILED'].includes(item.status)) statusColor = 'text-red-400';
              else if (['CANCELLED', 'EXPIRED'].includes(item.status))
                statusColor = 'text-orange-400';

              if (isTap) {
                // Collateral for Tap
                // Collateral comes as wei string usually
                let amount = 0;
                if (typeof item.collateral === 'string')
                  amount = parseFloat(item.collateral) / 1000000;
                else if (typeof item.collateral === 'bigint')
                  amount = Number(item.collateral) / 1000000;
                else if (typeof item.collateral === 'number') amount = item.collateral / 1000000;

                betMarginDisplay = `$${amount.toFixed(2)}`;

                // Tap: Show Tx Link or -
                if (item.status === 'EXECUTED' && item.executedTxHash) {
                  resultDisplay = 'View Tx';
                }
              } else {
                // Bet Amount for Binary
                let amount = 0;
                if (typeof item.betAmount === 'string') amount = parseFloat(item.betAmount);
                else if (typeof item.betAmount === 'number') amount = item.betAmount;

                betMarginDisplay = `$${amount.toFixed(2)}`;

                // Binary: Show Profit (Multiplier)
                const entry = parseFloat(item.entryPrice) / 100000000;
                const target = parseFloat(item.targetPrice) / 100000000;
                const mult = calculateMultiplier(entry, target, item.entryTime, item.targetTime);
                const multDisplay = (mult / 100).toFixed(2);

                if (item.status === 'WON') {
                  // Profit = Total Payout - Bet Amount
                  // Payout = Amount * (Mult/100)
                  const payout = amount * (mult / 100);
                  const profit = payout - amount;
                  resultDisplay = `+$${profit.toFixed(2)} (${multDisplay}x)`;
                } else if (item.status === 'LOST') {
                  resultDisplay = `-$${amount.toFixed(2)} (-1.00x)`;
                }
              }

              return (
                <TableRow
                  key={`${item.type}-${item.id || item.betId}`}
                  className="hover:bg-gray-800/30 transition-colors border-gray-800/50"
                >
                  <TableCell>
                    {isTap ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">
                        OPEN POS
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400">
                        1-TAP
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-white font-medium">
                    <div className="flex items-center gap-2">
                      <img
                        src={getLogoUrl(item.symbol)}
                        alt={item.symbol}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
                        }}
                      />
                      {formatMarketPair(item.symbol)}
                    </div>
                  </TableCell>

                  {/* Bet Margin */}
                  <TableCell className="text-right font-mono text-white">
                    {betMarginDisplay}
                  </TableCell>

                  {/* Result */}
                  <TableCell className="text-right font-mono text-white">
                    {resultDisplay === 'View Tx' ? (
                      <a
                        href={`https://sepolia.basescan.org/tx/${item.executedTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 underline hover:text-blue-300"
                      >
                        View Tx
                      </a>
                    ) : (
                      <span
                        className={
                          item.status === 'WON'
                            ? 'text-green-400'
                            : item.status === 'LOST'
                              ? 'text-red-400'
                              : 'text-gray-500'
                        }
                      >
                        {resultDisplay}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold text-xs ${statusColor}`}>
                    {item.status}
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-500">
                    {date.toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4 p-4 overflow-y-auto flex-1">
        {filteredHistory.map((item: any) => (
          <MobileHistoryCard
            key={`history-card-${item.type}-${item.id || item.betId}`}
            item={item}
          />
        ))}
      </div>
    </div>
  );
}
