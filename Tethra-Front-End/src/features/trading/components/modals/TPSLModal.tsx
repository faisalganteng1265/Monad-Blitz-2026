'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTPSL } from '@/features/trading/hooks/useTPSL';
import { formatMarketPair, inferMarketCategory } from '@/features/trading/lib/marketUtils';
import { formatPriceWithDecimals } from '@/features/trading/components/orders/order-panel/utils/formatUtils';
import { usePrice } from '@/hooks/data/usePrices';

interface TPSLModalProps {
  isOpen: boolean;
  onClose: (refresh: boolean) => void;
  positionId: number;
  trader: string;
  symbol: string;
  entryPrice: number;
  isLong: boolean;
}

const TPSLModal: React.FC<TPSLModalProps> = ({
  isOpen,
  onClose,
  positionId,
  trader,
  symbol,
  entryPrice,
  isLong,
}) => {
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const [takeProfitError, setTakeProfitError] = useState<string>('');
  const [stopLossError, setStopLossError] = useState<string>('');
  const { setTPSL, getTPSL, deleteTPSL, isPending } = useTPSL();

  // Fetch real-time price from backend
  const { price: priceData } = usePrice(symbol);
  const currentPrice = priceData?.price || entryPrice; // Fallback to entry if no price
  const marketCategory = inferMarketCategory(symbol);
  const isForex = marketCategory === 'forex';
  const priceDecimals = isForex ? 5 : 2;
  const priceStep = isForex ? '0.00001' : '0.01';
  const formatInputValue = (value: number) =>
    Number.isFinite(value) ? value.toFixed(priceDecimals) : '';
  const formatUsd = (value: number) => formatPriceWithDecimals(value, priceDecimals);

  // Load existing TP/SL on mount
  useEffect(() => {
    if (isOpen) {
      loadExistingTPSL();
    }
  }, [isOpen, positionId]);

  const loadExistingTPSL = async () => {
    const config = await getTPSL(positionId);
    if (config) {
      // Convert from 8 decimals to readable price
      if (config.takeProfit) {
        const tpPrice = parseFloat(config.takeProfit) / 100000000;
        setTakeProfitPrice(formatInputValue(tpPrice));
      }
      if (config.stopLoss) {
        const slPrice = parseFloat(config.stopLoss) / 100000000;
        setStopLossPrice(formatInputValue(slPrice));
      }
    }
  };

  // Validate TP/SL prices - use CURRENT price, not entry price
  const validatePrices = (): boolean => {
    let isValid = true;
    setTakeProfitError('');
    setStopLossError('');

    if (takeProfitPrice) {
      const tp = parseFloat(takeProfitPrice);
      if (isNaN(tp) || tp <= 0) {
        setTakeProfitError('Invalid price');
        isValid = false;
      } else if (isLong && tp <= currentPrice) {
        setTakeProfitError('TP must be above current price for Long');
        isValid = false;
      } else if (!isLong && tp >= currentPrice) {
        setTakeProfitError('TP must be below current price for Short');
        isValid = false;
      }
    }

    if (stopLossPrice) {
      const sl = parseFloat(stopLossPrice);
      if (isNaN(sl) || sl <= 0) {
        setStopLossError('Invalid price');
        isValid = false;
      } else if (isLong && sl >= currentPrice) {
        setStopLossError('SL must be below current price for Long');
        isValid = false;
      } else if (!isLong && sl <= currentPrice) {
        setStopLossError('SL must be above current price for Short');
        isValid = false;
      }
      // SL+ is allowed: SL can be above entry (for profit lock) as long as below current
    }

    if (!takeProfitPrice && !stopLossPrice) {
      setTakeProfitError('At least one of TP or SL required');
      isValid = false;
    }

    return isValid;
  };

  const handleSave = async () => {
    if (!validatePrices()) return;

    const success = await setTPSL({
      positionId,
      trader,
      takeProfit: takeProfitPrice || undefined,
      stopLoss: stopLossPrice || undefined,
    });

    if (success) {
      onClose(true);
    }
  };

  const handleDelete = async () => {
    const success = await deleteTPSL(positionId, trader);
    if (success) {
      setTakeProfitPrice('');
      setStopLossPrice('');
      onClose(true);
    }
  };

  const calculatePnL = (targetPrice: number) => {
    if (!targetPrice || targetPrice <= 0) return { pnl: 0, percentage: 0 };

    const priceDiff = isLong ? targetPrice - entryPrice : entryPrice - targetPrice;
    const percentage = (priceDiff / entryPrice) * 100;

    return { percentage };
  };

  if (!isOpen) return null;

  const tpPnL = calculatePnL(parseFloat(takeProfitPrice));
  const slPnL = calculatePnL(parseFloat(stopLossPrice));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0F1419] border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-white">Set TP/SL</h3>
            <p className="text-sm text-gray-400">
              {formatMarketPair(symbol)} - {isLong ? 'Long' : 'Short'} - Entry: {formatUsd(entryPrice)}
            </p>
          </div>
          <button
            onClick={() => onClose(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Current Price Info */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Current Price</span>
              <span className="text-white font-medium">{formatUsd(currentPrice)}</span>
            </div>
          </div>

          {/* Take Profit */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Take Profit Price</label>
            <div className="relative">
              <input
                type="number"
                step={priceStep}
                placeholder={`e.g., ${
                  isLong
                    ? formatInputValue(entryPrice * 1.1)
                    : formatInputValue(entryPrice * 0.9)
                }`}
                value={takeProfitPrice}
                onChange={(e) => {
                  setTakeProfitPrice(e.target.value);
                  setTakeProfitError('');
                }}
                className={`w-full bg-[#1A2332] border ${
                  takeProfitError ? 'border-red-500' : 'border-gray-700'
                } rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500 transition-colors`}
              />
              {takeProfitPrice && !takeProfitError && (
                <div
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${
                    tpPnL.percentage >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {tpPnL.percentage >= 0 ? '+' : ''}
                  {tpPnL.percentage.toFixed(2)}%
                </div>
              )}
            </div>
            {takeProfitError && <p className="text-xs text-red-400 mt-1">{takeProfitError}</p>}
            <p className="text-xs text-gray-500 mt-1">
              {isLong ? 'Must be above current price' : 'Must be below current price'}
            </p>
          </div>

          {/* Stop Loss */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Stop Loss Price</label>
            <div className="relative">
              <input
                type="number"
                step={priceStep}
                placeholder={`e.g., ${
                  isLong
                    ? formatInputValue(entryPrice * 0.95)
                    : formatInputValue(entryPrice * 1.05)
                }`}
                value={stopLossPrice}
                onChange={(e) => {
                  setStopLossPrice(e.target.value);
                  setStopLossError('');
                }}
                className={`w-full bg-[#1A2332] border ${
                  stopLossError ? 'border-red-500' : 'border-gray-700'
                } rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500 transition-colors`}
              />
              {stopLossPrice && !stopLossError && (
                <div
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${
                    slPnL.percentage >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {slPnL.percentage >= 0 ? '+' : ''}
                  {slPnL.percentage.toFixed(2)}%
                </div>
              )}
            </div>
            {stopLossError && <p className="text-xs text-red-400 mt-1">{stopLossError}</p>}
            <p className="text-xs text-gray-500 mt-1">
              {isLong
                ? 'Must be below current price (can be above entry for SL+)'
                : 'Must be above current price (can be below entry for SL+)'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-700">
          {(takeProfitPrice || stopLossPrice) && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            onClick={() => onClose(false)}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save TP/SL'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TPSLModal;


