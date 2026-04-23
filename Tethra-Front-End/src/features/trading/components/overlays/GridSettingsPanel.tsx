'use client';

import React from 'react';
import { GridConfig } from '@/types/gridTrading';

interface GridSettingsPanelProps {
  gridConfig: GridConfig;
  onConfigChange: (updates: Partial<GridConfig>) => void;
  interval: string;
  stats: {
    totalCells: number;
    buyOrders: number;
    sellOrders: number;
    totalOrders: number;
  };
}

const GridSettingsPanel: React.FC<GridSettingsPanelProps> = ({
  gridConfig,
  onConfigChange,
  interval,
  stats,
}) => {
  // Get interval label
  const getIntervalLabel = () => {
    const labels: Record<string, string> = {
      '1': '1m',
      '3': '3m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '120': '2h',
      '240': '4h',
      'D': '1D',
      'W': '1W',
    };
    return labels[interval] || interval;
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-xl p-4 border border-slate-700 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
          </svg>
          Grid Settings
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">TF: {getIntervalLabel()}</span>
        </div>
      </div>

      {/* Time Multiplier (X-axis) */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">
          Time Grid Size (X-axis)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={gridConfig.timeMultiplier}
            onChange={(e) => onConfigChange({ timeMultiplier: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-white">
              {gridConfig.timeMultiplier}x
            </span>
            <span className="text-xs text-slate-400">
              ({gridConfig.timeMultiplier * (interval === 'D' ? 24 : interval === 'W' ? 168 : parseInt(interval) || 60)} min)
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          1 grid = {gridConfig.timeMultiplier} × {getIntervalLabel()} candle{gridConfig.timeMultiplier > 1 ? 's' : ''}
        </p>
      </div>

      {/* Price Grid Size (Y-axis) */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">
          Price Grid Size (Y-axis)
        </label>
        
        {/* Grid Type Selector */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => onConfigChange({ priceGridType: 'percentage' })}
            className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
              gridConfig.priceGridType === 'percentage'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Percentage (%)
          </button>
          <button
            onClick={() => onConfigChange({ priceGridType: 'absolute' })}
            className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
              gridConfig.priceGridType === 'absolute'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Absolute ($)
          </button>
        </div>

        {/* Price Input */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.1"
            max={gridConfig.priceGridType === 'percentage' ? '10' : '1000'}
            step={gridConfig.priceGridType === 'percentage' ? '0.1' : '1'}
            value={gridConfig.priceGridSize}
            onChange={(e) => onConfigChange({ priceGridSize: parseFloat(e.target.value) || 0.1 })}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm font-bold text-white">
            {gridConfig.priceGridType === 'percentage' ? '%' : '$'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Each grid level is {gridConfig.priceGridSize}
          {gridConfig.priceGridType === 'percentage' ? '%' : '$'} apart
        </p>
      </div>

      {/* Show Labels Toggle */}
      <div className="mb-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-slate-300">Show Grid Labels</span>
          <div className="relative">
            <input
              type="checkbox"
              checked={gridConfig.showLabels}
              onChange={(e) => onConfigChange({ showLabels: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </div>
        </label>
      </div>

      {/* Statistics */}
      <div className="border-t border-slate-700 pt-4">
        <h4 className="text-xs font-bold text-slate-300 mb-2">Grid Statistics</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-700/50 rounded p-2">
            <div className="text-xs text-slate-400">Selected Cells</div>
            <div className="text-lg font-bold text-white">{stats.totalCells}</div>
          </div>
          <div className="bg-slate-700/50 rounded p-2">
            <div className="text-xs text-slate-400">Total Orders</div>
            <div className="text-lg font-bold text-white">{stats.totalOrders}</div>
          </div>
          <div className="bg-green-500/10 rounded p-2 border border-green-500/30">
            <div className="text-xs text-green-400">Buy Orders</div>
            <div className="text-lg font-bold text-green-400">{stats.buyOrders}</div>
          </div>
          <div className="bg-red-500/10 rounded p-2 border border-red-500/30">
            <div className="text-xs text-red-400">Sell Orders</div>
            <div className="text-lg font-bold text-red-400">{stats.sellOrders}</div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
        <p className="text-xs text-blue-400">
          <strong>💡 Tap to Trade:</strong> Click grid cells below current price for <strong>Buy</strong> orders, above for <strong>Sell</strong> orders.
        </p>
      </div>
    </div>
  );
};

export default GridSettingsPanel;
