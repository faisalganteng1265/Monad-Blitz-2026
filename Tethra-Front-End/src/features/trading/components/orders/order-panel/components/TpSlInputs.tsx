import React from 'react';

interface TpSlInputsProps {
  isTpSlEnabled: boolean;
  setIsTpSlEnabled: (enabled: boolean) => void;
  takeProfitPrice: string;
  setTakeProfitPrice: (price: string) => void;
  stopLossPrice: string;
  setStopLossPrice: (price: string) => void;
  disabled?: boolean;
}

export const TpSlInputs: React.FC<TpSlInputsProps> = ({
  isTpSlEnabled,
  setIsTpSlEnabled,
  takeProfitPrice,
  setTakeProfitPrice,
  stopLossPrice,
  setStopLossPrice,
  disabled = false,
}) => {
  const handlePriceChange = (
    setter: (value: string) => void,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setter(value);
    }
  };

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="flex justify-between items-center text-sm mb-3">
        <span className="text-text-secondary text-xs uppercase tracking-wide font-medium">
          TP / SL
        </span>
        <label className="relative inline-block w-9 h-5 cursor-pointer">
          <input
            type="checkbox"
            className="opacity-0 w-0 h-0 peer"
            checked={isTpSlEnabled}
            onChange={(e) => setIsTpSlEnabled(e.target.checked)}
            disabled={disabled}
          />
          <span
            className={`absolute inset-0 rounded-full transition-all duration-300 ${
              isTpSlEnabled ? 'bg-primary' : 'bg-trading-surface border border-border-default'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 bg-white rounded-full transition-transform duration-300 shadow-sm ${
                isTpSlEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            ></span>
          </span>
        </label>
      </div>

      {/* Take Profit / Stop Loss Form */}
      {isTpSlEnabled && (
        <div className="bg-trading-surface border border-border-default rounded-lg p-3 space-y-3 animate-slide-down">
          {/* Take Profit */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5 block font-medium">
              TAKE PROFIT
            </label>
            <div className="bg-trading-bg rounded-md px-3 py-2 flex items-center border border-border-default hover:border-border-active focus-within:border-primary transition-colors">
              <span className="text-xs text-text-muted mr-2">$</span>
              <input
                type="text"
                placeholder="Price"
                value={takeProfitPrice}
                onChange={(e) => handlePriceChange(setTakeProfitPrice, e)}
                className="bg-transparent text-sm text-text-primary outline-none w-full placeholder-text-muted"
                disabled={disabled}
              />
            </div>
          </div>

          {/* Stop Loss */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5 block font-medium">
              STOP LOSS
            </label>
            <div className="bg-trading-bg rounded-md px-3 py-2 flex items-center border border-border-default hover:border-border-active focus-within:border-primary transition-colors">
              <span className="text-xs text-text-muted mr-2">$</span>
              <input
                type="text"
                placeholder="Price"
                value={stopLossPrice}
                onChange={(e) => handlePriceChange(setStopLossPrice, e)}
                className="bg-transparent text-sm text-text-primary outline-none w-full placeholder-text-muted"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
