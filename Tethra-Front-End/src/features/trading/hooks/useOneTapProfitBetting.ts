'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSessionKey } from '@/features/wallet/hooks/useSessionKey';
import {
  encodeFunctionData,
  parseUnits,
  createWalletClient,
  custom,
  keccak256,
  encodePacked,
  toHex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import axios from 'axios';
import { toast } from 'sonner';
import { STABILITY_FUND_ADDRESS, USDC_ADDRESS } from '@/config/contracts';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const ONE_TAP_PROFIT_ADDRESS = process.env.NEXT_PUBLIC_ONE_TAP_PROFIT_ADDRESS as `0x${string}`;
const RELAY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_RELAY_WALLET_ADDRESS as `0x${string}`;

const USDC_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface PlaceBetPrivateParams extends PlaceBetParams {
  isUp: boolean;
}

function getDenomination(betAmount: number): number {
  if (betAmount <= 20) return 5;
  if (betAmount <= 100) return 10;
  if (betAmount <= 500) return 50;
  return 100;
}

function encryptForBackend(data: {
  trader: string;
  betAmount: number;
  targetPrice: string;
  isUp: boolean;
  secret: string;
}): string {
  // For hackathon: base64 encode. In prod: AES encrypt with shared key from Vault DON.
  return btoa(JSON.stringify(data));
}

interface PlaceBetParams {
  symbol: string;
  betAmount: string;
  targetPrice: string;
  targetTime: number;
  entryPrice: string;
  entryTime: number;
}

export interface Bet {
  betId: string;
  trader: string;
  symbol: string;
  betAmount: string;
  targetPrice: string;
  targetTime: number;
  entryPrice: string;
  entryTime: number;
  multiplier: number;
  status: 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED';
  settledAt?: number;
  settlePrice?: string;
}

interface MultiplierResult {
  multiplier: number;
  priceDistance: string;
  timeDistance: number;
}

export const useOneTapProfit = () => {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState(false);
  const prevActiveBetsRef = useRef<Bet[]>([]);
  const hasInitializedRef = useRef(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

  const [sessionPnL, setSessionPnL] = useState<number>(0);

  // Poll for active bets to update status and detect wins
  useEffect(() => {
    if (!authenticated || !user || !embeddedWallet) return;

    const intervalId = setInterval(() => {
      fetchActiveBets();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(intervalId);
  }, [authenticated, user, embeddedWallet]);

  // Win detection logic
  useEffect(() => {
    // Skip first run to avoid false positives on page load
    if (!hasInitializedRef.current) {
      if (activeBets.length > 0) hasInitializedRef.current = true;
      prevActiveBetsRef.current = activeBets;
      return;
    }

    // Find bets that were active but are now gone
    const missingBets = prevActiveBetsRef.current.filter(
      (prevBet: Bet) => !activeBets.find((currBet: Bet) => currBet.betId === prevBet.betId),
    );

    if (missingBets.length > 0) {
      // Check status of missing bets to see if they won
      missingBets.forEach(async (bet: Bet) => {
        try {
          const response = await axios.get(`${BACKEND_URL}/api/one-tap/bet/${bet.betId}`);
          const status = response.data.data.status;

          if (status === 'WON') {
            // Play win sound
            try {
              const audio = new Audio('/sounds/win.mp3');
              audio.volume = 0.6;
              await audio.play();
            } catch (e) {
              console.warn(
                'Win sound failed to play (might be missing file or browser policy):',
                e,
              );
            }

            // Update Session PnL (Profit = Payout - Bet Amount)
            // Payout = BetAmount * Multiplier / 100
            const betAmountVal = parseFloat(bet.betAmount);
            const profit = (betAmountVal * bet.multiplier) / 100 - betAmountVal;
            setSessionPnL((prev) => prev + profit);

            toast.success(`You won! +$${profit.toFixed(2)}`, {
              description: `${(bet.multiplier / 100).toFixed(2)}x on ${bet.symbol}`,
              position: 'top-center',
              duration: 3000,
            });
          } else if (status === 'LOST') {
            // Update Session PnL (Loss = Bet Amount)
            const betAmountVal = parseFloat(bet.betAmount);
            setSessionPnL((prev) => prev - betAmountVal);

            toast.error(`You lost $${betAmountVal.toFixed(2)}`, {
              description: `Better luck next time on ${bet.symbol}`,
              position: 'top-center',
              duration: 3000,
            });
          }
        } catch (err) {
          console.error('Failed to check status of finished bet:', err);
        }
      });
    }

    prevActiveBetsRef.current = activeBets;
  }, [activeBets]);

  // Session key hook for gasless trading
  const {
    sessionKey,
    isSessionValid,
    createSession,
    signWithSession,
    clearSession,
    getTimeRemaining,
  } = useSessionKey();

  /**
   * Calculate multiplier for given parameters
   */
  const calculateMultiplier = useCallback(
    async (
      entryPrice: string,
      targetPrice: string,
      entryTime: number,
      targetTime: number,
    ): Promise<MultiplierResult> => {
      try {
        const response = await axios.post(`${BACKEND_URL}/api/one-tap/calculate-multiplier`, {
          entryPrice,
          targetPrice,
          entryTime,
          targetTime,
        });

        return response.data.data;
      } catch (error) {
        console.error('Failed to calculate multiplier:', error);
        throw error;
      }
    },
    [],
  );

  /**
   * Place bet with session key (fully gasless)
   */
  /**
   * Place bet with session key (fully gasless)
   * Can accept sessionKey/signer from arguments (preferred) or use internal state (fallback)
   */
  const placeBetWithSession = useCallback(
    async (
      params: PlaceBetParams,
      sessionOptions?: {
        sessionKey: any;
        sessionSigner: (hash: `0x${string}`) => Promise<string | null>;
      },
    ) => {
      if (!authenticated || !user || !embeddedWallet) {
        throw new Error('Wallet not connected');
      }

      // Use provided session options OR internal hook state
      const activeSessionKey = sessionOptions?.sessionKey || sessionKey;
      const signer = sessionOptions?.sessionSigner || signWithSession;

      // Basic validation check (internal isSessionValid might be stale, so check object existence)
      if (!activeSessionKey || activeSessionKey.expiresAt <= Date.now()) {
        // Fallback to internal check if no options provided
        if (!sessionOptions && !isSessionValid()) {
          throw new Error(
            'Session key expired or not created. Please enable Binary Trading again.',
          );
        } else if (sessionOptions) {
          throw new Error('Session key provided is invalid or expired.');
        }
      }

      setIsPlacingBet(true);

      try {
        const userAddress = embeddedWallet.address;

        // Sign bet parameters with session key
        const messageHash = keccak256(
          encodePacked(
            ['address', 'string', 'uint256', 'uint256', 'uint256'],
            [
              userAddress as `0x${string}`,
              params.symbol,
              parseUnits(params.betAmount, 6),
              parseUnits(params.targetPrice, 8),
              BigInt(Math.floor(params.targetTime)),
            ],
          ),
        );

        const sessionSignature = await signer(messageHash);

        // Call backend endpoint (session validation happens off-chain)
        const response = await axios.post(`${BACKEND_URL}/api/one-tap/place-bet-with-session`, {
          trader: userAddress,
          symbol: params.symbol,
          betAmount: params.betAmount,
          targetPrice: params.targetPrice,
          targetTime: params.targetTime,
          entryPrice: params.entryPrice,
          entryTime: params.entryTime,
          sessionSignature,
        });

        // Refresh active bets
        await fetchActiveBets();

        return response.data.data;
      } catch (error) {
        console.error('Failed to place bet with session:', error);
        throw error;
      } finally {
        setIsPlacingBet(false);
      }
    },
    [
      authenticated,
      user,
      embeddedWallet,
      isSessionValid,
      createSession,
      signWithSession,
      sessionKey,
    ],
  );

  /**
   * Place a bet (legacy method with user signature)
   */
  const placeBet = useCallback(
    async (params: PlaceBetParams) => {
      if (!authenticated || !user || !embeddedWallet) {
        throw new Error('Wallet not connected');
      }

      setIsPlacingBet(true);

      try {
        const ethereumProvider = await embeddedWallet.getEthereumProvider();
        const userAddress = embeddedWallet.address as `0x${string}`;

        // Create wallet client
        const walletClient = createWalletClient({
          account: userAddress,
          chain: baseSepolia,
          transport: custom(ethereumProvider),
        });

        // Fetch nonce from contract
        const nonceData = encodeFunctionData({
          abi: [
            {
              inputs: [{ name: 'trader', type: 'address' }],
              name: 'metaNonces',
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'metaNonces',
          args: [userAddress],
        });

        const nonceResult = await ethereumProvider.request({
          method: 'eth_call',
          params: [
            {
              to: ONE_TAP_PROFIT_ADDRESS,
              data: nonceData,
            },
            'latest',
          ],
        });

        const nonce = BigInt(nonceResult as string);

        // Create message hash matching contract's expectation:
        // keccak256(abi.encodePacked(trader, symbol, betAmount, targetPrice, targetTime, nonce, contractAddress))
        const messageHash = keccak256(
          encodePacked(
            ['address', 'string', 'uint256', 'uint256', 'uint256', 'uint256', 'address'],
            [
              userAddress,
              params.symbol,
              parseUnits(params.betAmount, 6),
              parseUnits(params.targetPrice, 8),
              BigInt(Math.floor(params.targetTime)),
              nonce,
              ONE_TAP_PROFIT_ADDRESS,
            ],
          ),
        );

        // Sign the message hash
        const signature = await walletClient.signMessage({
          account: userAddress,
          message: { raw: messageHash },
        });

        // Check USDC allowance
        const allowanceData = encodeFunctionData({
          abi: USDC_ABI,
          functionName: 'allowance',
          args: [userAddress, STABILITY_FUND_ADDRESS],
        });

        const allowanceResult = await ethereumProvider.request({
          method: 'eth_call',
          params: [
            {
              to: USDC_ADDRESS,
              data: allowanceData,
            },
            'latest',
          ],
        });

        const allowance = BigInt(allowanceResult as string);

        // Approve infinite USDC if needed (only once)
        if (allowance === 0n) {
          // Use max uint256 for infinite approval
          const maxApproval = BigInt(
            '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          );

          const approveData = encodeFunctionData({
            abi: USDC_ABI,
            functionName: 'approve',
            args: [STABILITY_FUND_ADDRESS, maxApproval],
          });

          const approveTxHash = await walletClient.sendTransaction({
            account: userAddress,
            to: USDC_ADDRESS,
            data: approveData,
          });

          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        // Call backend to place bet
        const response = await axios.post(`${BACKEND_URL}/api/one-tap/place-bet`, {
          trader: userAddress,
          symbol: params.symbol,
          betAmount: params.betAmount,
          targetPrice: params.targetPrice,
          targetTime: params.targetTime,
          entryPrice: params.entryPrice,
          entryTime: params.entryTime,
          nonce: nonce.toString(),
          userSignature: signature,
        });

        // Refresh active bets
        await fetchActiveBets();

        return response.data.data;
      } catch (error) {
        console.error('Failed to place bet:', error);
        throw error;
      } finally {
        setIsPlacingBet(false);
      }
    },
    [authenticated, user, embeddedWallet],
  );

  /**
   * Fetch active bets
   */
  const fetchActiveBets = useCallback(async () => {
    if (!authenticated || !user || !embeddedWallet) {
      return;
    }

    setIsLoadingBets(true);

    try {
      const userAddress = embeddedWallet.address;

      const response = await axios.get(`${BACKEND_URL}/api/one-tap/bets`, {
        params: {
          trader: userAddress,
          status: 'ACTIVE',
        },
      });

      setActiveBets(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch active bets:', error);
    } finally {
      setIsLoadingBets(false);
    }
  }, [authenticated, user, embeddedWallet]);

  /**
   * Fetch user's bet history
   */
  const fetchBetHistory = useCallback(async () => {
    if (!authenticated || !user || !embeddedWallet) {
      return [];
    }

    try {
      const userAddress = embeddedWallet.address;

      const response = await axios.get(`${BACKEND_URL}/api/one-tap/bets`, {
        params: {
          trader: userAddress,
        },
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Failed to fetch bet history:', error);
      return [];
    }
  }, [authenticated, user, embeddedWallet]);

  /**
   * Get statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/one-tap/stats`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      return null;
    }
  }, []);

  /**
   * Deposit USDC to relay wallet upfront (one-time transfer when enabling private mode).
   * Backend tracks balance per user.
   */
  const depositToRelay = useCallback(
    async (amount: number) => {
      if (!authenticated || !user || !embeddedWallet) {
        throw new Error('Wallet not connected');
      }

      const ethereumProvider = await embeddedWallet.getEthereumProvider();
      const userAddress = embeddedWallet.address as `0x${string}`;

      const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: custom(ethereumProvider),
        account: userAddress,
      });

      const transferData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [RELAY_WALLET_ADDRESS, parseUnits(String(amount), 6)],
      });

      await walletClient.sendTransaction({
        to: USDC_ADDRESS as `0x${string}`,
        data: transferData,
      });

      // Register deposit with backend
      await axios.post(`${BACKEND_URL}/api/one-tap/deposit-relay`, {
        trader: userAddress,
        amount,
      });

      toast.success(`Deposited ${amount} USDC to private relay`, { position: 'top-center' });
    },
    [authenticated, user, embeddedWallet],
  );

  /**
   * Withdraw remaining USDC from relay wallet back to user.
   * Backend sends USDC from relay → user's embedded wallet.
   */
  const withdrawFromRelay = useCallback(
    async () => {
      if (!authenticated || !user || !embeddedWallet) {
        throw new Error('Wallet not connected');
      }

      const userAddress = embeddedWallet.address as `0x${string}`;
      const resp = await axios.post(`${BACKEND_URL}/api/one-tap/withdraw-relay`, {
        trader: userAddress,
      });

      const withdrawn = resp.data.amount ?? 0;
      toast.success(`Withdrawn ${withdrawn} USDC from relay`, { position: 'top-center' });
    },
    [authenticated, user, embeddedWallet],
  );

  /**
   * Fetch relay balance for current user from backend.
   */
  const fetchRelayBalance = useCallback(
    async (): Promise<number> => {
      if (!embeddedWallet) return 0;
      try {
        const resp = await axios.get(
          `${BACKEND_URL}/api/one-tap/relay-balance/${embeddedWallet.address}`,
        );
        return resp.data.balance ?? 0;
      } catch {
        return 0;
      }
    },
    [embeddedWallet],
  );

  /**
   * Place private bet — relay wallet pays on-chain.
   * User must deposit USDC to relay first via depositToRelay.
   */
  const placeBetPrivate = useCallback(
    async (params: PlaceBetPrivateParams) => {
      if (!authenticated || !user || !embeddedWallet) {
        throw new Error('Wallet not connected');
      }

      setIsPlacingBet(true);

      try {
        const userAddress = embeddedWallet.address as `0x${string}`;
        const rawAmount = parseFloat(params.betAmount) || 5;

        // Snap to valid denomination (contract requires 5, 10, 50, or 100)
        const betAmountNum = rawAmount <= 5 ? 5 : rawAmount <= 10 ? 10 : rawAmount <= 50 ? 50 : 100;

        // Generate commitment
        const randomBytes = new Uint8Array(32);
        crypto.getRandomValues(randomBytes);
        const secret = toHex(randomBytes);

        const commitment = keccak256(
          encodePacked(
            ['address', 'uint256', 'uint256', 'bool', 'bytes32'],
            [
              userAddress,
              parseUnits(String(betAmountNum), 6),
              parseUnits(params.targetPrice, 8),
              params.isUp,
              secret as `0x${string}`,
            ],
          ),
        );

        const encrypted = encryptForBackend({
          trader: userAddress,
          betAmount: betAmountNum,
          targetPrice: params.targetPrice,
          isUp: params.isUp,
          secret,
        });

        // Submit to backend (backend handles on-chain call via relay)
        const response = await axios.post(`${BACKEND_URL}/api/one-tap/place-bet-private`, {
          trader: userAddress,
          symbol: params.symbol,
          targetTime: params.targetTime,
          betAmount: betAmountNum,
          targetPrice: params.targetPrice,
          isUp: params.isUp,
          entryPrice: params.entryPrice,
          entryTime: params.entryTime,
          commitment,
          encrypted,
        });

        toast.success(`Private bet placed: ${betAmountNum} USDC`, {
          position: 'top-center',
        });

        await fetchActiveBets();
        return response.data;
      } catch (error: any) {
        const msg = error?.response?.data?.error || error?.message || 'Failed to place private bet';
        console.error('Failed to place private bet:', msg);
        toast.error(msg, { position: 'top-center' });
        throw error;
      } finally {
        setIsPlacingBet(false);
      }
    },
    [authenticated, user, embeddedWallet],
  );

  return {
    placeBet,
    placeBetWithSession,
    placeBetPrivate,
    depositToRelay,
    withdrawFromRelay,
    fetchRelayBalance,
    calculateMultiplier,
    fetchActiveBets,
    fetchBetHistory,
    fetchStats,
    activeBets,
    isPlacingBet,
    isLoadingBets,
    sessionKey,
    isSessionValid,
    createSession,
    clearSession,
    sessionTimeRemaining: getTimeRemaining(),
    sessionPnL,
  };
};
