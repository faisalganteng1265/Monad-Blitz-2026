'use client';
import React, { useState, useMemo } from 'react';
import { ArrowDownUp, Settings, Info } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useUSDCBalance } from '@/hooks/data/useUSDCBalance';

// Mock exchange rate: 1 TETHRA = 0.1 USDC (or 1 USDC = 10 TETHRA)
const EXCHANGE_RATE = 10; // TETHRA per USDC
const SLIPPAGE = 0.5; // 0.5% slippage
const SWAP_FEE = 0.003; // 0.3% swap fee

interface Token {
  symbol: string;
  name: string;
  logo: string;
  balance?: string;
}

const TOKENS: { [key: string]: Token } = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    logo: '/icons/usdc.png',
  },
  TETHRA: {
    symbol: 'TETH',
    name: 'Tethra Token',
    logo: '/tethra-logo.png',
  },
};

const SwapPanel: React.FC = () => {
  const { authenticated } = usePrivy();
  const { usdcBalance, isLoadingBalance } = useUSDCBalance();

  const [fromToken, setFromToken] = useState<Token>(TOKENS.USDC);
  const [toToken, setToToken] = useState<Token>(TOKENS.TETHRA);
  const [fromAmount, setFromAmount] = useState<string>('');
  const [isSwapping, setIsSwapping] = useState(false);

  // Calculate exchange amounts
  const toAmount = useMemo(() => {
    if (!fromAmount || parseFloat(fromAmount) === 0) return '';

    const amount = parseFloat(fromAmount);
    let result: number;

    if (fromToken.symbol === 'USDC') {
      // USDC to TETHRA
      result = amount * EXCHANGE_RATE * (1 - SWAP_FEE);
    } else {
      // TETHRA to USDC
      result = (amount / EXCHANGE_RATE) * (1 - SWAP_FEE);
    }

    return result.toFixed(6);
  }, [fromAmount, fromToken.symbol]);

  // Calculate price impact (mock)
  const priceImpact = useMemo(() => {
    if (!fromAmount || parseFloat(fromAmount) === 0) return '0.00';
    const amount = parseFloat(fromAmount);
    // Simple mock: larger trades have more impact
    return Math.min(amount / 1000, 2).toFixed(2);
  }, [fromAmount]);

  // Calculate minimum received with slippage
  const minimumReceived = useMemo(() => {
    if (!toAmount) return '';
    const amount = parseFloat(toAmount);
    return (amount * (1 - SLIPPAGE / 100)).toFixed(6);
  }, [toAmount]);

  const handleFromAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFromAmount(value);
    }
  };

  const handleMaxClick = () => {
    if (fromToken.symbol === 'USDC') {
      setFromAmount(usdcBalance);
    } else {
      // Mock TETHRA balance
      setFromAmount('0');
    }
  };

  const handleSwapTokens = () => {
    // Swap the tokens
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);

    // Clear amounts
    setFromAmount('');
  };

  const handleSwap = async () => {
    if (!authenticated) return;

    setIsSwapping(true);

    // Mock swap execution
    await new Promise((resolve) => setTimeout(resolve, 2000));

    alert(`Swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}`);

    setIsSwapping(false);
    setFromAmount('');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(price);
  };

  const isSwapDisabled =
    !authenticated || !fromAmount || parseFloat(fromAmount) === 0 || isSwapping;

  return (
    <div className="flex flex-col gap-3 md:px-4 px-3 md:py-4 py-3 bg-[#0F1419]">
      {/* From Token */}
      <div>
        <div className="bg-[#1A2332] border border-[#2D3748] rounded-lg md:p-3 p-2">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-gray-400">From</label>
            <span className="text-xs text-gray-400">
              Balance:{' '}
              {fromToken.symbol === 'USDC'
                ? isLoadingBalance
                  ? 'Loading...'
                  : `${usdcBalance} ${fromToken.symbol}`
                : '0.00 TETH'}
            </span>
          </div>

          <div className="flex justify-between items-center mb-2 gap-2">
            <input
              type="text"
              placeholder="0.0"
              value={fromAmount}
              onChange={handleFromAmountChange}
              className="bg-transparent text-2xl text-white outline-none flex-1 min-w-0"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleMaxClick}
                className="bg-[#2D3748] px-2 py-0.5 rounded text-xs cursor-pointer hover:bg-[#3d4a5f] transition-colors"
              >
                Max
              </button>
              <div className="flex items-center gap-1.5 bg-[#2D3748] rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#3d4a5f] transition-colors">
                <img
                  src={fromToken.logo}
                  alt={fromToken.symbol}
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                  }}
                />
                <span className="font-medium text-white text-sm whitespace-nowrap">
                  {fromToken.symbol}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            {fromAmount && parseFloat(fromAmount) > 0
              ? fromToken.symbol === 'USDC'
                ? formatPrice(parseFloat(fromAmount))
                : formatPrice(parseFloat(fromAmount) / EXCHANGE_RATE)
              : '$0.00'}
          </div>
        </div>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={handleSwapTokens}
          className="bg-[#1A2332] border-2 border-[#2D3748] rounded-lg p-2 hover:bg-[#2D3748] transition-colors cursor-pointer"
        >
          <ArrowDownUp size={20} className="text-blue-300" />
        </button>
      </div>

      {/* To Token */}
      <div>
        <div className="bg-[#1A2332] border border-[#2D3748] rounded-lg md:p-3 p-2">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-gray-400">To</label>
            <span className="text-xs text-gray-400">
              Balance:{' '}
              {toToken.symbol === 'USDC'
                ? isLoadingBalance
                  ? 'Loading...'
                  : `${usdcBalance} ${toToken.symbol}`
                : '0.00 TETH'}
            </span>
          </div>

          <div className="flex justify-between items-center mb-2 gap-2">
            <input
              type="text"
              placeholder="0.0"
              value={toAmount}
              readOnly
              className="bg-transparent text-2xl text-white outline-none flex-1 min-w-0"
            />
            <div className="flex items-center gap-1.5 bg-[#2D3748] rounded-lg px-2.5 py-1.5 flex-shrink-0">
              <img
                src={toToken.logo}
                alt={toToken.symbol}
                className="w-5 h-5 rounded-full flex-shrink-0"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                }}
              />
              <span className="font-medium text-white text-sm whitespace-nowrap">
                {toToken.symbol}
              </span>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            {toAmount && parseFloat(toAmount) > 0
              ? toToken.symbol === 'USDC'
                ? formatPrice(parseFloat(toAmount))
                : formatPrice(parseFloat(toAmount) / EXCHANGE_RATE)
              : '$0.00'}
          </div>
        </div>
      </div>

      {/* Exchange Rate Info */}
      {fromAmount && parseFloat(fromAmount) > 0 && (
        <div className="bg-[#1A2332] rounded-lg p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400">Rate</span>
            <span className="text-white font-medium">
              1 {fromToken.symbol === 'USDC' ? 'USDC' : 'TETHRA'} ={' '}
              {fromToken.symbol === 'USDC'
                ? `${EXCHANGE_RATE} TETHRA`
                : `${(1 / EXCHANGE_RATE).toFixed(2)} USDC`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Minimum Received</span>
              <Info size={12} className="text-gray-500" />
            </div>
            <span className="text-white">
              {minimumReceived} {toToken.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400">Price Impact</span>
            <span className={`${parseFloat(priceImpact) > 1 ? 'text-red-400' : 'text-green-400'}`}>
              {priceImpact}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Swap Fee</span>
            <span className="text-white">{(SWAP_FEE * 100).toFixed(2)}%</span>
          </div>
        </div>
      )}

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={isSwapDisabled}
        className={`w-full py-4 rounded-lg font-bold text-white transition-all duration-200 ${
          isSwapDisabled
            ? 'bg-gray-600 cursor-not-allowed opacity-50'
            : 'bg-blue-400 hover:bg-blue-500 cursor-pointer'
        }`}
      >
        {!authenticated
          ? 'Connect Wallet'
          : isSwapping
          ? 'Swapping...'
          : !fromAmount || parseFloat(fromAmount) === 0
          ? 'Enter Amount'
          : `Swap ${fromToken.symbol} for ${toToken.symbol}`}
      </button>

      {/* Additional Info */}
      <div className="space-y-2 text-sm border-t border-[#1A202C] pt-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Network</span>
          <span className="text-white">Base Sepolia</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Slippage Tolerance</span>
          <span className="text-white">{SLIPPAGE}%</span>
        </div>
      </div>

      {/* Mock Warning */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-yellow-400 font-medium mb-1">Mock Interface</p>
            <p className="text-xs text-gray-400">
              This is a mockup interface. No actual swap will occur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapPanel;
