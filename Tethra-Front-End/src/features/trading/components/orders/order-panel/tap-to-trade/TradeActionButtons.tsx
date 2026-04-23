import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ConnectedWallet } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Market } from '../components/MarketSelector';
import { inferMarketCategory } from '@/features/trading/lib/marketUtils';

interface TradeActionButtonsProps {
  tradeMode: 'open-position' | 'one-tap-profit' | 'quick-tap';
  tapToTrade: any;
  activeMarket: Market | null;
  marginAmount: string;
  leverage: number;
  timeframe: string;
  currentPrice: string;
  hasLargeAllowance: boolean;
  hasLargeOneTapProfitAllowance: boolean;
  hasUnifiedAllowance?: boolean;
  hasSelectedYGrid: boolean;
  wallets: ConnectedWallet[];

  onPreApprove: () => Promise<void>;
  onPreApproveOneTapProfit: () => Promise<void>;
  isApprovalPending: boolean;
  isOneTapProfitApprovalPending: boolean;
  disabled?: boolean;
  onMobileClose?: () => void;
  depositToRelay?: (amount: number) => Promise<void>;
  withdrawFromRelay?: () => Promise<void>;
  fetchRelayBalance?: () => Promise<number>;
  usdcBalance?: string;
}

export const TradeActionButtons: React.FC<TradeActionButtonsProps> = ({
  tradeMode,
  tapToTrade,
  activeMarket,
  marginAmount,
  leverage,
  timeframe,
  currentPrice,
  hasLargeAllowance,
  hasLargeOneTapProfitAllowance,
  hasUnifiedAllowance,
  hasSelectedYGrid,
  wallets,

  onPreApprove,
  onPreApproveOneTapProfit,
  isApprovalPending,
  isOneTapProfitApprovalPending,
  disabled,
  onMobileClose,
  depositToRelay,
  withdrawFromRelay,
  fetchRelayBalance,
  usdcBalance,
}) => {
  const [relayBalance, setRelayBalance] = useState(0);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const isPrivateMode = tapToTrade.isPrivateMode;

  // Fetch relay balance when private mode is active
  useEffect(() => {
    if (!isPrivateMode || !fetchRelayBalance) return;
    fetchRelayBalance().then(setRelayBalance);
    const interval = setInterval(() => fetchRelayBalance().then(setRelayBalance), 5000);
    return () => clearInterval(interval);
  }, [isPrivateMode, fetchRelayBalance]);
  const resolvedHasAllowance = hasUnifiedAllowance ?? (hasLargeAllowance || hasLargeOneTapProfitAllowance);
  const marketCategory = activeMarket
    ? activeMarket.category ?? inferMarketCategory(activeMarket.symbol)
    : 'crypto';
  const isUnsupportedMarket =
    (tradeMode === 'quick-tap' || tradeMode === 'one-tap-profit') && marketCategory !== 'crypto';
  const handleMainAction = async () => {
    if (isUnsupportedMarket) {
      toast.error(
        tradeMode === 'quick-tap'
          ? 'Quick Tap only supports crypto pairs for now'
          : 'Binary Trade only supports crypto pairs for now',
      );
      return;
    }
    if (!resolvedHasAllowance) {
      if (tradeMode === 'one-tap-profit') {
        await onPreApproveOneTapProfit();
      } else {
        await onPreApprove();
      }
      return;
    }

    if (!marginAmount || parseFloat(marginAmount) === 0) {
      toast.error(
        tradeMode === 'one-tap-profit' ? 'Please enter bet amount' : 'Please enter margin amount',
      );
      return;
    }

    if (tradeMode === 'open-position' && !hasSelectedYGrid) {
      toast.error('Please select Y Coordinate (Price Grid) first');
      return;
    }

    if (tradeMode === 'open-position' || tradeMode === 'quick-tap') {
      const params: {
        symbol: string;
        margin: string;
        leverage: number;
        timeframe?: string;
        currentPrice: number;
      } = {
        symbol: activeMarket?.symbol || 'BTC',
        margin: marginAmount,
        leverage: leverage,
        currentPrice: Number(currentPrice) || 0,
      };

      if (tradeMode === 'open-position') {
        params.timeframe = timeframe;
      }

      await tapToTrade.toggleMode({
        ...params,
      });
      onMobileClose?.();
    } else {
      // Binary Trading Logic
      try {
        // Private mode: deposit to relay first if needed
        if (isPrivateMode && depositToRelay) {
          const betAmountNum = parseFloat(marginAmount) || 5;
          const denom = betAmountNum <= 5 ? 5 : betAmountNum <= 10 ? 10 : betAmountNum <= 50 ? 50 : 100;

          if (relayBalance < denom) {
            setIsDepositing(true);
            toast.loading('Depositing USDC to private relay...', { id: 'binary-session' });
            try {
              await depositToRelay(denom * 10); // Deposit for ~10 taps
              const newBal = await fetchRelayBalance?.() ?? 0;
              setRelayBalance(newBal);
              toast.success(`Deposited ${denom * 10} USDC to relay`, { id: 'binary-session' });
            } finally {
              setIsDepositing(false);
            }
          }
        }

        toast.loading('Creating session key...', {
          id: 'binary-session',
        });

        const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
        if (!embeddedWallet) throw new Error('Privy wallet not found');

        const walletClient = await embeddedWallet.getEthereumProvider();
        if (!walletClient) throw new Error('Could not get wallet client');

        const newSession = await tapToTrade.createSession(
          embeddedWallet.address,
          walletClient,
          30 * 60 * 1000,
        );

        if (!newSession) throw new Error('Session creation failed');

        await tapToTrade.toggleMode({
          symbol: activeMarket?.symbol || 'BTC',
          margin: marginAmount,
          leverage: 1,
          timeframe: '1',
          currentPrice: Number(currentPrice) || 0,
        });

        tapToTrade.setIsBinaryTradingEnabled(true);
        toast.success('Binary Trading enabled!', { id: 'binary-session', duration: 5000 });
        onMobileClose?.();
      } catch (error) {
        console.error('Failed to enable binary trading:', error);
        toast.error('Failed to enable binary trading', { id: 'binary-session' });
      }
    }
  };

  const STOP_ACTION = async () => {
    if (tradeMode === 'one-tap-profit') {
      tapToTrade.setIsBinaryTradingEnabled(false);
      await tapToTrade.toggleMode();
      toast.success('Binary Trading stopped');
    } else {
      await tapToTrade.toggleMode();
    }
  };

  if (tapToTrade.isEnabled) {
    const handleWithdraw = async () => {
      if (!withdrawFromRelay) return;
      setIsWithdrawing(true);
      try {
        await withdrawFromRelay();
        setRelayBalance(0);
      } finally {
        setIsWithdrawing(false);
      }
    };

    return (
      <div className="flex flex-col gap-2 mt-2">
        {isPrivateMode && relayBalance > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <span className="text-xs text-purple-400">Relay Balance: {relayBalance} USDC</span>
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="text-xs text-purple-400 hover:text-purple-300 underline disabled:opacity-50"
            >
              {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
            </button>
          </div>
        )}
        <Button
          variant="destructive"
          size="lg"
          onClick={STOP_ACTION}
          disabled={tapToTrade.isLoading}
          className="w-full font-bold shadow-lg shadow-destructive/30"
        >
          {tapToTrade.isLoading
            ? 'Stopping...'
            : tradeMode === 'one-tap-profit'
            ? 'Stop Trading'
            : tradeMode === 'quick-tap'
            ? 'Stop Quick Tap'
            : 'Stop Tap to Trade'}
        </Button>
      </div>
    );
  }

  // Determine Button State
  let buttonText = 'Enable Tap to Trade';
  let isLoading = false;
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' = 'default';

  if (tradeMode === 'open-position') {
    if (!resolvedHasAllowance) {
      buttonText = isApprovalPending ? 'Activating Trading...' : 'Activate Trading';
      isLoading = isApprovalPending;
      variant = 'default';
    } else {
      buttonText = tapToTrade.isLoading ? 'Setting up session...' : 'Enable Tap to Trade';
      isLoading = tapToTrade.isLoading;
    }
  } else if (tradeMode === 'quick-tap') {
    if (!resolvedHasAllowance) {
      buttonText = isApprovalPending ? 'Activating Trading...' : 'Activate Trading';
      isLoading = isApprovalPending;
      variant = 'default';
    } else {
      buttonText = tapToTrade.isLoading ? 'Setting up session...' : 'Enable Quick Tap';
      isLoading = tapToTrade.isLoading;
    }
  } else {
    if (!resolvedHasAllowance) {
      const loading = tradeMode === 'one-tap-profit' ? isOneTapProfitApprovalPending : isApprovalPending;
      buttonText = loading ? 'Activating Trading...' : 'Activate Trading';
      isLoading = loading;
    } else {
      buttonText = tapToTrade.isLoading ? 'Setting up session...' : 'Enable Binary Trade';
      isLoading = tapToTrade.isLoading;
    }
  }

  if (isUnsupportedMarket) {
    buttonText = tradeMode === 'quick-tap' ? 'Quick Tap (Crypto only)' : 'Binary Trade (Crypto only)';
    isLoading = false;
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      {isPrivateMode && tradeMode === 'one-tap-profit' && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
          <span className="text-xs text-purple-400">
            Relay Balance: {relayBalance} USDC
          </span>
          {relayBalance > 0 && withdrawFromRelay && (
            <button
              onClick={async () => {
                setIsWithdrawing(true);
                try {
                  await withdrawFromRelay();
                  setRelayBalance(0);
                } finally {
                  setIsWithdrawing(false);
                }
              }}
              disabled={isWithdrawing}
              className="text-xs text-purple-400 hover:text-purple-300 underline disabled:opacity-50"
            >
              {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
            </button>
          )}
        </div>
      )}
      <Button
        size="lg"
        className="w-full font-bold shadow-lg shadow-primary/30"
        onClick={handleMainAction}
        disabled={disabled || isLoading || isUnsupportedMarket || isDepositing}
      >
        {(isLoading || isDepositing) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isDepositing ? 'Depositing...' : buttonText}
      </Button>
    </div>
  );
};
