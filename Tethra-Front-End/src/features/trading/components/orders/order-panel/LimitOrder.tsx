'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { usePrivy } from '@privy-io/react-auth';
import { parseUnits } from 'viem';
import { useLimitOrderSubmit } from './LimitOrderIntegration';
import { useApproveUSDCForLimitOrders } from '@/features/trading/hooks/useLimitOrder';
import { useUSDCBalance } from '@/hooks/data/useUSDCBalance';
import { toast } from 'sonner';
import { Market } from './components/MarketSelector';

import { CollateralInput } from './components/CollateralInput';
import { LeverageSelector } from './components/LeverageSelector';
import { PositionInfo } from './components/PositionInfo';
import { TpSlInputs } from './components/TpSlInputs';
import { OrderSummary } from './components/OrderSummary';

import { LimitPriceInput } from './limit-order/LimitPriceInput';
import { LimitActionButtons } from './limit-order/LimitActionButtons';

interface LimitOrderProps {
  activeTab?: 'long' | 'short' | 'swap';
}

const LimitOrder: React.FC<LimitOrderProps> = ({ activeTab = 'long' }) => {
  const { activeMarket, setActiveMarket, currentPrice } = useMarket();
  const { authenticated } = usePrivy();
  const [leverage, setLeverage] = useState(10);
  const { usdcBalance, isLoadingBalance } = useUSDCBalance();
  const [oraclePrice, setOraclePrice] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [isTpSlEnabled, setIsTpSlEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
  const [stopLossPrice, setStopLossPrice] = useState<string>('');

  const { submitLimitOrder, isProcessing } = useLimitOrderSubmit();

  const {
    approve: approveUSDC,
    allowance,
    isPending: isApprovalPending,
    refetchAllowance,
    isSuccess: isApprovalSuccess,
  } = useApproveUSDCForLimitOrders();

  const hasLargeAllowance = useMemo(() => {
    return Boolean(allowance && allowance > parseUnits('10000', 6));
  }, [allowance]);

  useEffect(() => {
    if (isApprovalSuccess) {
      const timer = setTimeout(() => {
        refetchAllowance();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isApprovalSuccess, refetchAllowance]);

  const handleMarketSelect = (market: Market) => {
    setActiveMarket({ ...market, category: market.category || 'crypto' });
  };

  const effectiveOraclePrice = oraclePrice || (currentPrice ? parseFloat(currentPrice) : 0);
  const payUsdValue = payAmount ? parseFloat(payAmount) : 0;
  const balanceValue = usdcBalance ? parseFloat(usdcBalance) : 0;
  const hasInsufficientBalance =
    payAmount !== '' && !Number.isNaN(payUsdValue) && payUsdValue > balanceValue;
  const longShortUsdValue = payUsdValue * leverage;
  const tokenAmount = effectiveOraclePrice > 0 ? longShortUsdValue / effectiveOraclePrice : 0;

  const liquidationPrice = useMemo(() => {
    const triggerPriceNum = limitPrice ? parseFloat(limitPrice) : null;

    if (
      !triggerPriceNum ||
      !leverage ||
      leverage <= 0 ||
      !payAmount ||
      parseFloat(payAmount) <= 0
    ) {
      return null;
    }

    const liqPercentage = 1 / leverage;

    if (activeTab === 'long') {
      return triggerPriceNum * (1 - liqPercentage);
    } else if (activeTab === 'short') {
      return triggerPriceNum * (1 + liqPercentage);
    }
    return null;
  }, [limitPrice, leverage, payAmount, activeTab]);

  const handlePayInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPayAmount(value);
    }
  };

  const handleLimitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setLimitPrice(value);
    }
  };

  const handleMaxClick = () => {
    setPayAmount(usdcBalance);
  };

  // Fetch Pyth Oracle price via WebSocket
  useEffect(() => {
    const wsUrl =
      (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/^http/, 'ws') +
      '/ws/price';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'price_update' && message.data && activeMarket) {
          const priceData = message.data[activeMarket.symbol];
          if (priceData) {
            setOraclePrice(priceData.price);
          }
        }
      } catch (error) {
        // Silent error
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [activeMarket]);

  const handleCreateOrder = async () => {
    const needsActivation = !hasLargeAllowance;

    if (needsActivation) {
      try {
        toast.loading('Activating trading...', { id: 'limit-approval' });
        const maxAmount = parseUnits('1000000', 6).toString();
        await approveUSDC(maxAmount);
        toast.success('Trading activated!', { id: 'limit-approval' });
      } catch (error) {
        console.error('Approval failed:', error);
        toast.error('Approval failed or rejected', { id: 'limit-approval' });
        return;
      }
      return;
    }

    if (!activeMarket) return;
    if (hasInsufficientBalance) {
      toast.error('Insufficient USDC balance');
      return;
    }

    let tpPrice: string | undefined;
    let slPrice: string | undefined;

    if (isTpSlEnabled) {
      if (takeProfitPrice) {
        const tpNum = parseFloat(takeProfitPrice);
        if (!isNaN(tpNum) && tpNum > 0) {
          tpPrice = Math.floor(tpNum * 100000000).toString();
        }
      }
      if (stopLossPrice) {
        const slNum = parseFloat(stopLossPrice);
        if (!isNaN(slNum) && slNum > 0) {
          slPrice = Math.floor(slNum * 100000000).toString();
        }
      }
    }

    await submitLimitOrder({
      symbol: activeMarket.symbol,
      isLong: activeTab === 'long',
      collateral: payAmount || '0',
      leverage,
      triggerPrice: limitPrice || '0',
      takeProfit: tpPrice,
      stopLoss: slPrice,
    });
  };

  return (
    <div className="flex flex-col gap-3 py-4 bg-trading-bg h-full px-3">
      {/* Pay Section */}
      <CollateralInput
        value={payAmount}
        onChange={handlePayInputChange}
        balance={usdcBalance}
        isLoadingBalance={isLoadingBalance}
        onMaxClick={handleMaxClick}
        label="Collateral"
        tokenSymbol="USDC"
      />

      {/* Position Info */}
      <PositionInfo
        activeTab={activeTab}
        payUsdValue={payUsdValue}
        oraclePrice={effectiveOraclePrice}
        longShortUsdValue={longShortUsdValue}
        tokenAmount={tokenAmount}
        leverage={leverage}
        activeMarket={activeMarket}
        onMarketSelect={handleMarketSelect}
      />

      {/* Limit Price */}
      <LimitPriceInput
        limitPrice={limitPrice}
        onLimitPriceChange={handleLimitPriceChange}
        effectiveOraclePrice={effectiveOraclePrice}
        activeTab={activeTab}
        activeMarket={activeMarket}
      />

      {/* Leverage Slider */}
      {activeTab !== 'swap' && (
        <LeverageSelector leverage={leverage} onLeverageChange={setLeverage} />
      )}

      {/* Swap Message */}
      {activeTab === 'swap' && (
        <div className="text-center py-3 text-gray-500 text-sm">Select different tokens</div>
      )}

      {/* TP/SL Inputs */}
      {activeTab !== 'swap' && (
        <TpSlInputs
          isTpSlEnabled={isTpSlEnabled}
          setIsTpSlEnabled={setIsTpSlEnabled}
          takeProfitPrice={takeProfitPrice}
          setTakeProfitPrice={setTakeProfitPrice}
          stopLossPrice={stopLossPrice}
          setStopLossPrice={setStopLossPrice}
        />
      )}

      {/* Order Summary */}
      <OrderSummary
        oraclePrice={effectiveOraclePrice}
        liquidationPrice={liquidationPrice}
        tradingFee={
          payAmount && leverage > 0
            ? (parseFloat(payAmount) * leverage * 0.0005).toFixed(6)
            : '0.00'
        }
        payAmount={payAmount}
        leverage={leverage}
        marketCategory={activeMarket?.category}
      />

      {/* Action Button */}
      <LimitActionButtons
        activeTab={activeTab}
        authenticated={authenticated}
        isProcessing={isProcessing}
        isUSDCApprovalPending={isApprovalPending}
        payAmount={payAmount}
        limitPrice={limitPrice}
        hasLargeAllowance={hasLargeAllowance}
        hasInsufficientBalance={hasInsufficientBalance}
        onAction={handleCreateOrder}
      />
    </div>
  );
};

export default LimitOrder;
