'use client';

import React, { useEffect, useState } from 'react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { useBinaryOrders, BinaryOrder } from '@/features/trading/hooks/useBinaryOrders';

const COLLATERAL_PRESETS = [5, 10, 50] as const;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function formatTimeLeft(targetTime: number): string {
  const secs = Math.max(0, targetTime - Math.floor(Date.now() / 1000));
  if (secs <= 0) return 'Settling...';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function MultiplierBadge({ multiplier }: { multiplier: number }) {
  const mx = multiplier / 100;
  const color = mx < 2 ? 'text-orange-400' : mx < 5 ? 'text-yellow-400' : 'text-green-400';
  return <span className={`font-bold text-xs ${color}`}>{mx.toFixed(2)}x</span>;
}

export default function SessionControls() {
  const { isActive, setIsActive, collateralPerTap, setCollateralPerTap } = useTapToTrade();
  const { orders: myOrders, isLoading } = useBinaryOrders();
  const [allActiveBets, setAllActiveBets] = useState<BinaryOrder[]>([]);
  const [, tick] = useState(0);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch all active bets (all traders)
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/one-tap/active`);
        const data = await res.json();
        if (data.success && data.data) setAllActiveBets(data.data);
      } catch {}
    };
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, []);

  const myActiveBets = myOrders.filter((o) => o.status === 'ACTIVE');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Collateral + Start/Stop */}
      <div className="flex flex-col gap-2 px-3 py-3 border-b border-border-muted shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">Collateral:</span>
          {COLLATERAL_PRESETS.map((amt) => (
            <button
              key={amt}
              onClick={() => setCollateralPerTap(amt)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                collateralPerTap === amt
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-slate-400 hover:text-white'
              }`}
            >
              ${amt}
            </button>
          ))}
          <input
            type="number"
            value={COLLATERAL_PRESETS.includes(collateralPerTap as any) ? '' : collateralPerTap}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) setCollateralPerTap(v);
            }}
            placeholder="Custom"
            className="w-14 px-2 py-1 rounded text-xs bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-violet-500"
            min="1"
          />
        </div>
        <button
          onClick={() => setIsActive(!isActive)}
          className={`w-full py-2 rounded font-semibold text-sm transition-all ${
            isActive
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-violet-600 hover:bg-violet-700 text-white'
          }`}
        >
          {isActive ? 'Stop Trading' : 'Start Trading'}
        </button>
      </div>

      {/* Your Position */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-3 py-2 border-b border-border-muted shrink-0">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Your Position
            {myActiveBets.length > 0 && (
              <span className="ml-1.5 bg-violet-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                {myActiveBets.length}
              </span>
            )}
          </span>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 max-h-[35%]">
          {isLoading ? (
            <p className="text-xs text-slate-500 px-3 py-3">Loading...</p>
          ) : myActiveBets.length === 0 ? (
            <p className="text-xs text-slate-600 px-3 py-3">No active positions</p>
          ) : (
            myActiveBets.map((bet) => (
              <div
                key={bet.betId}
                className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 hover:bg-zinc-800/30"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-1 rounded ${
                        bet.direction === 'UP'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-red-900/50 text-red-400'
                      }`}
                    >
                      {bet.direction === 'UP' ? '▲' : '▼'}
                    </span>
                    <span className="text-xs text-slate-300">{bet.symbol}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    ${typeof bet.betAmount === 'number' ? bet.betAmount.toFixed(2) : parseFloat(bet.betAmount as string).toFixed(2)} USDC
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <MultiplierBadge multiplier={bet.multiplier} />
                  <span className="text-[10px] font-mono text-yellow-400">
                    {formatTimeLeft(bet.targetTime)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Active Bets — all traders */}
        <div className="px-3 py-2 border-t border-b border-border-muted shrink-0">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Active Bets
            {allActiveBets.length > 0 && (
              <span className="ml-1.5 bg-zinc-700 text-slate-300 rounded-full px-1.5 py-0.5 text-[10px]">
                {allActiveBets.length}
              </span>
            )}
          </span>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {allActiveBets.length === 0 ? (
            <p className="text-xs text-slate-600 px-3 py-3">No active bets</p>
          ) : (
            allActiveBets.map((bet) => (
              <div
                key={bet.betId}
                className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/40 hover:bg-zinc-800/20"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-1 rounded ${
                        bet.direction === 'UP'
                          ? 'bg-green-900/40 text-green-400'
                          : 'bg-red-900/40 text-red-400'
                      }`}
                    >
                      {bet.direction === 'UP' ? '▲' : '▼'}
                    </span>
                    <span className="text-xs text-slate-400">{bet.symbol}</span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-mono">
                    {(bet as any).trader
                      ? `${String((bet as any).trader).slice(0, 6)}…${String((bet as any).trader).slice(-4)}`
                      : 'Anonymous'}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <MultiplierBadge multiplier={bet.multiplier} />
                  <span className="text-[10px] font-mono text-yellow-400">
                    {formatTimeLeft(bet.targetTime)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
