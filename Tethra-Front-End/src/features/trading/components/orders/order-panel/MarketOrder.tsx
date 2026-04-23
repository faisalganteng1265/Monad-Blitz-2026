'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { baseSepolia } from 'wagmi/chains';
import { parseUnits } from 'viem';
import {
  useRelayMarketOrder,
  useApproveUSDCForTrading,
  calculatePositionCost,
} from '@/features/trading/hooks/useMarketOrder';
import { usePaymasterFlow } from '@/features/wallet/hooks/usePaymaster';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';
import { useUSDCBalance } from '@/hooks/data/useUSDCBalance';
import { toast } from 'sonner';
import { useTPSL } from '@/features/trading/hooks/useTPSL';
import { useUserPositions } from '@/hooks/data/usePositions';
import { Market } from './components/MarketSelector';
import { CollateralInput } from './components/CollateralInput';
import { LeverageSelector } from './components/LeverageSelector';
import { PositionInfo } from './components/PositionInfo';
import { TpSlInputs } from './components/TpSlInputs';
import { OrderSummary } from './components/OrderSummary';

import { MarketActionButtons } from './market-order/MarketActionButtons';

interface MarketOrderProps {
  activeTab?: 'long' | 'short' | 'swap';
}

const MarketOrder: React.FC<MarketOrderProps> = ({ activeTab = 'long' }) => {
  const { activeMarket, setActiveMarket, currentPrice } = useMarket();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { address: embeddedAddress, hasEmbeddedWallet } = useEmbeddedWallet();
  const [leverage, setLeverage] = useState(10);
  const { usdcBalance, isLoadingBalance } = useUSDCBalance();
  const [payAmount, setPayAmount] = useState<string>('');
  const [isTpSlEnabled, setIsTpSlEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const processedHashRef = useRef<string | null>(null);

  const {
    openPositionGasless,
    isPending: isRelayPending,
    hash: relayHash,
    usdcCharged,
    positionId: relayPositionId,
  } = useRelayMarketOrder();

  const { balance: paymasterBalance, isApproving, isDepositing } = usePaymasterFlow();

  const {
    approve: approveUSDC,
    allowance,
    isPending: isApprovalPending,
  } = useApproveUSDCForTrading();
  const { setTPSL } = useTPSL();
  const { positionIds, refetch: refetchPositions } = useUserPositions();

  const hasLargeAllowance = useMemo(() => {
    return Boolean(allowance && allowance > parseUnits('10000', 6));
  }, [allowance]);

  const handleMarketSelect = (market: Market) => {
    setActiveMarket({ ...market, category: market.category || 'crypto' });
  };

  // Get oracle price from current price - memoized
  const oraclePrice = useMemo(() => {
    return currentPrice ? parseFloat(currentPrice) : 0;
  }, [currentPrice]);

  const payUsdValue = useMemo(() => {
    return payAmount ? parseFloat(payAmount) : 0;
  }, [payAmount]);
  const balanceValue = useMemo(() => {
    return usdcBalance ? parseFloat(usdcBalance) : 0;
  }, [usdcBalance]);
  const hasInsufficientBalance = useMemo(() => {
    return payAmount !== '' && !Number.isNaN(payUsdValue) && payUsdValue > balanceValue;
  }, [payAmount, payUsdValue, balanceValue]);

  const longShortUsdValue = useMemo(() => {
    return payUsdValue * leverage;
  }, [payUsdValue, leverage]);

  const tokenAmount = useMemo(() => {
    return oraclePrice > 0 ? longShortUsdValue / oraclePrice : 0;
  }, [oraclePrice, longShortUsdValue]);

  // Calculate liquidation price
  const liquidationPrice = useMemo(() => {
    if (!oraclePrice || !leverage || leverage <= 0 || !payAmount || parseFloat(payAmount) <= 0) {
      return null;
    }

    // Liquidation happens when loss = collateral
    const liqPercentage = 1 / leverage;

    if (activeTab === 'long') {
      return oraclePrice * (1 - liqPercentage);
    } else if (activeTab === 'short') {
      return oraclePrice * (1 + liqPercentage);
    }
    return null;
  }, [oraclePrice, leverage, payAmount, activeTab]);

  const handlePayInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPayAmount(value);
    }
  };

  const handleMaxClick = () => {
    setPayAmount(usdcBalance);
  };

  // Handle market order execution
  const handleOpenPosition = async () => {
    if (!authenticated) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!hasEmbeddedWallet || !embeddedAddress) {
      toast.error('Embedded wallet not ready. Please wait...');
      return;
    }

    const needsActivation = !hasLargeAllowance;

    // Find and set active embedded wallet used for both actions
    const embeddedWallet = wallets.find(
      (w) => w.walletClientType === 'privy' && w.address === embeddedAddress,
    );

    if (!embeddedWallet) {
      toast.error('Embedded wallet not found in wallets list');
      return;
    }

    await embeddedWallet.switchChain(baseSepolia.id);

    // 1. Handle activation if needed (global gate)
    if (needsActivation) {
      try {
        toast.loading('Activating trading...', { id: 'market-approval' });
        const maxAmount = parseUnits('1000000', 6).toString();
        // This likely prompts wallet and waits for tx hash.
        // We assume verify or wait logic is inside or handled by blockchain speed.
        await approveUSDC(maxAmount);
        toast.success('✅ Trading activated!', { id: 'market-approval' });
      } catch (error) {
        console.error('Approval failed:', error);
        toast.error('Approval failed or rejected', { id: 'market-approval' });
        return; // Stop flow if approval fails
      }
      return; // Require activation before trading
    }

    if (!payAmount || parseFloat(payAmount) <= 0) {
      toast.error('Please enter collateral amount');
      return;
    }

    if (!activeMarket) {
      toast.error('Please select a market');
      return;
    }
    if (hasInsufficientBalance) {
      toast.error('Insufficient USDC balance');
      return;
    }

    // 2. Proceed to trade
    try {
      // Execute market order (GASLESS via relay!)
      await openPositionGasless({
        symbol: activeMarket.symbol,
        isLong: activeTab === 'long',
        collateral: payAmount,
        leverage: Math.floor(leverage), // Round to integer
      });
      // Success toast will be shown by useEffect below
    } catch (error) {
      console.error('Error executing market order:', error);
      toast.error('Failed to execute market order');
    }
  };

  // Show success notification with explorer link and auto-set TP/SL
  useEffect(() => {
    // Only process new hashes, prevent duplicate toasts
    if (relayHash && relayHash !== processedHashRef.current) {
      processedHashRef.current = relayHash; // Mark as processed

      const shouldSetTPSL = isTpSlEnabled && (takeProfitPrice || stopLossPrice);

      toast.success(
        <div>
          <div>✅ Position opened!</div>
          <a
            href={`https://sepolia.basescan.org/tx/${relayHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 hover:underline text-xs"
          >
            View transaction
          </a>
          {shouldSetTPSL && (
            <div className="text-blue-300 text-xs mt-1">🎯 Setting TP/SL automatically...</div>
          )}
        </div>,
        { duration: 4000, id: 'position-success' },
      );

      // Auto-set TP/SL if enabled
      if (shouldSetTPSL && embeddedAddress) {
        const setTPSLForNewPosition = async () => {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const newPositionId = relayPositionId;

            if (!newPositionId) {
              toast.error('⚠️ Could not get position ID. Set TP/SL manually.', {
                duration: 5000,
              });
              return;
            }

            const success = await setTPSL({
              positionId: newPositionId,
              trader: embeddedAddress,
              takeProfit: takeProfitPrice || undefined,
              stopLoss: stopLossPrice || undefined,
            });

            if (success) {
              toast.success('✅ TP/SL set successfully!', { duration: 3000 });
              window.dispatchEvent(
                new CustomEvent('tpsl-updated', {
                  detail: { positionId: newPositionId },
                }),
              );
            }
          } catch (error) {
            console.error('Failed to auto-set TP/SL:', error);
            toast.error('⚠️ Could not auto-set TP/SL.', { duration: 5000 });
          }
        };

        setTPSLForNewPosition();
      }

      setPayAmount('');
      if (!shouldSetTPSL) {
        setTakeProfitPrice('');
        setStopLossPrice('');
        setIsTpSlEnabled(false);
      } else {
        setTimeout(() => {
          setTakeProfitPrice('');
          setStopLossPrice('');
          setIsTpSlEnabled(false);
        }, 5000);
      }
    }
  }, [
    relayHash,
    usdcCharged,
    isTpSlEnabled,
    takeProfitPrice,
    stopLossPrice,
    embeddedAddress,
    setTPSL,
    refetchPositions,
    positionIds,
    relayPositionId,
  ]);

  return (
    <div className="flex flex-col gap-3 py-4 bg-trading-bg h-full px-3">
      {/* Collateral Input (USDC) */}
      <CollateralInput
        value={payAmount}
        onChange={handlePayInputChange}
        balance={usdcBalance}
        isLoadingBalance={isLoadingBalance}
        onMaxClick={handleMaxClick}
        label="Collateral"
      />

      {/* Position Info (Size & Market Selector) */}
      <PositionInfo
        activeTab={activeTab}
        payUsdValue={payUsdValue}
        oraclePrice={oraclePrice}
        longShortUsdValue={longShortUsdValue}
        tokenAmount={tokenAmount}
        leverage={leverage}
        activeMarket={activeMarket}
        onMarketSelect={handleMarketSelect}
      />

      {/* Leverage Selector - Hidden for Swap */}
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
        oraclePrice={oraclePrice}
        liquidationPrice={liquidationPrice}
        tradingFee={
          payAmount && leverage > 0 ? calculatePositionCost(payAmount, leverage).tradingFee : '0.00'
        }
        payAmount={payAmount}
        leverage={leverage}
        marketCategory={activeMarket?.category}
      />

      {/* Action Button */}
      <MarketActionButtons
        activeTab={activeTab}
        authenticated={authenticated}
        isApproving={isApproving}
        isDepositing={isDepositing}
        isRelayPending={isRelayPending}
        isUSDCApprovalPending={isApprovalPending}
        payAmount={payAmount}
        hasLargeAllowance={hasLargeAllowance}
        hasInsufficientBalance={hasInsufficientBalance}
        onAction={handleOpenPosition}
      />

      {/* Paymaster Info */}
      {authenticated && parseFloat(paymasterBalance) > 0 && (
        <div className="text-xs text-text-muted text-center pt-2">
          Gas Balance: ${parseFloat(paymasterBalance).toFixed(2)} USDC
        </div>
      )}
    </div>
  );
};

export default MarketOrder;
