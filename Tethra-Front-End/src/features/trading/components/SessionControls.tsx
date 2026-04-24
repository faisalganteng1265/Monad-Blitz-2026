'use client';

import React from 'react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';

const ASSETS = ['BTC', 'ETH', 'MON'] as const;
const COLLATERAL_PRESETS = [5, 10, 50] as const;

export default function SessionControls() {
  const { isActive, setIsActive, asset, setAsset, collateralPerTap, setCollateralPerTap } =
    useTapToTrade();

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border-muted bg-[#0B1017]">
      {/* Asset selector */}
      <div className="flex items-center gap-1">
        {ASSETS.map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
              asset === a
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-slate-400 hover:text-white'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Collateral presets */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500 mr-1">Collateral:</span>
        {COLLATERAL_PRESETS.map((amt) => (
          <button
            key={amt}
            onClick={() => setCollateralPerTap(amt)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              collateralPerTap === amt
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-slate-400 hover:text-white'
            }`}
          >
            ${amt}
          </button>
        ))}
        {/* Custom amount input */}
        <input
          type="number"
          value={COLLATERAL_PRESETS.includes(collateralPerTap as any) ? '' : collateralPerTap}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) setCollateralPerTap(v);
          }}
          placeholder="Custom"
          className="w-16 px-2 py-1 rounded text-xs bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-indigo-500"
          min="1"
          step="1"
        />
      </div>

      {/* Start / Stop */}
      <button
        onClick={() => setIsActive(!isActive)}
        className={`ml-auto px-4 py-1.5 rounded font-semibold text-sm transition-all ${
          isActive
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {isActive ? 'Stop Trading' : 'Start Trading'}
      </button>
    </div>
  );
}
