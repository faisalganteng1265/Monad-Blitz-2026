import React from 'react';
import { Grid as GridIcon, Info } from 'lucide-react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Market } from '../components/MarketSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface GridSettingsProps {
  tradeMode: 'open-position' | 'one-tap-profit' | 'quick-tap';
  activeMarket: Market | null;
  timeframe: string;
  currentPrice: string;
  setHasSelectedYGrid: (value: boolean) => void;
  disabled?: boolean;
}

export const GridSettings: React.FC<GridSettingsProps> = ({
  tradeMode,
  activeMarket,
  timeframe,
  currentPrice,
  setHasSelectedYGrid,
  disabled = false,
}) => {
  const tapToTrade = useTapToTrade();

  if (tradeMode !== 'open-position') return null;

  const isDisabled = disabled || tapToTrade.isEnabled;

  return (
    <div className="space-y-4 border-t border-border-muted pt-4">
      <div className="font-semibold text-text-secondary flex items-center gap-2 mys-2">
        <GridIcon size={14} />
        Tap to Trade Grid Settings
      </div>

      {/* X Coordinate - Time Grid */}
      <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
        <label className="text-xs text-text-secondary mb-3 flex items-center gap-1">
          X Coordinate (Time Grid Size)
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help inline-flex">
                <Info
                  size={12}
                  className="text-text-muted hover:text-text-primary transition-colors"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                1 Grid Column = {tapToTrade.gridSizeX} Candle
                {tapToTrade.gridSizeX > 1 ? 's' : ''}
              </p>
            </TooltipContent>
          </Tooltip>
        </label>
        <div className="flex items-center gap-3">
          <Slider
            value={[tapToTrade.gridSizeX]}
            min={1}
            max={15}
            step={1}
            onValueChange={(val) => tapToTrade.setGridSizeX(val[0])}
            disabled={isDisabled}
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <div className="bg-trading-surface border border-border-default rounded p-3 py-1.5 min-w-[30px] text-center">
              <span className="text-text-primary font-semibold text-sm">
                {tapToTrade.gridSizeX}
              </span>
            </div>
            <span className="text-text-muted text-xs"> candles</span>
          </div>
        </div>
      </div>

      {/* Y Coordinate - Price Grid */}
      <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
        <label className="text-xs text-text-secondary mb-2 flex items-center gap-1">
          Y Coordinate (Price Grid Size)
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help inline-flex">
                <Info
                  size={12}
                  className="text-text-muted hover:text-text-primary transition-colors"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Each Grid Row = {tapToTrade.gridSizeY.toFixed(1)}% Price Difference</p>
            </TooltipContent>
          </Tooltip>
        </label>

        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={tapToTrade.gridSizeY}
              onChange={(e) => {
                tapToTrade.setGridSizeY(parseFloat(e.target.value) || 0.001);
                setHasSelectedYGrid(true);
              }}
              disabled={isDisabled}
              className="bg-trading-surface border-border-default pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
              %
            </span>
          </div>
        </div>

        {/* Price Difference Display */}
        {Number(currentPrice) > 0 && (
          <div className="mt-3">
            <label className="text-xs text-text-secondary mb-2 block">
              Price difference per grid
            </label>
            <div className="bg-trading-surface border border-border-default rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="text-text-primary font-medium">
                {((Number(currentPrice) * tapToTrade.gridSizeY) / 100).toFixed(2)}
              </span>
              <span className="text-text-muted text-sm">$</span>
            </div>
          </div>
        )}
      </div>

      {/* Cell Orders Statistics */}
      {tapToTrade.isEnabled && tapToTrade.cellOrders.size > 0 && (
        <div className="bg-trading-surface rounded-lg p-3 space-y-2 border border-border-default">
          <div className="text-xs font-semibold text-text-primary mb-2">Active Orders</div>
          <div className="flex justify-between text-xs">
            <span className="text-text-secondary">Total Orders:</span>
            <span className="text-text-primary font-semibold">
              {Array.from(tapToTrade.cellOrders.values()).reduce(
                (sum: any, cell: any) => sum + cell.orderCount,
                0,
              )}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-secondary">Cells with Orders:</span>
            <span className="text-text-primary font-semibold">{tapToTrade.cellOrders.size}</span>
          </div>
        </div>
      )}
    </div>
  );
};
