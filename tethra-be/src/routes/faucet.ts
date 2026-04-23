import { Router, Request, Response } from 'express';
import { Logger } from '../utils/Logger';
import { createWalletClient, http, parseUnits, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const logger = new Logger('FaucetRoute');

const CLAIM_AMOUNT = '100';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const claimTimestamps = new Map<string, number>();

// Minimal ERC20 ABI for transfers and balance checks
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function formatRemainingMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function createFaucetRoute(): Router {
  const router = Router();

  /**
   * POST /api/faucet/claim
   * Claim mock USDC from faucet
   */
  router.post('/claim', async (req: Request, res: Response) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Address is required',
          timestamp: Date.now()
        });
      }

      if (typeof address !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid address format',
          timestamp: Date.now()
        });
      }

      const trimmedAddress = address.trim();

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid address format',
          timestamp: Date.now()
        });
      }

      const normalizedAddress = trimmedAddress.toLowerCase();
      const now = Date.now();
      const lastClaimAt = claimTimestamps.get(normalizedAddress);
      if (lastClaimAt && now - lastClaimAt < COOLDOWN_MS) {
        const nextClaimAt = lastClaimAt + COOLDOWN_MS;
        const remainingMs = nextClaimAt - now;
        return res.status(429).json({
          success: false,
          error: `Faucet cooldown active. Try again in ${formatRemainingMs(remainingMs)}.`,
          data: {
            cooldownMs: COOLDOWN_MS,
            remainingMs,
            lastClaimAt,
            nextClaimAt
          },
          timestamp: Date.now()
        });
      }

      // Get configuration from environment
      const usdcAddress = process.env.USDC_TOKEN_ADDRESS;
      const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;
      const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';

      if (!faucetPrivateKey) {
        logger.error('FAUCET_PRIVATE_KEY not configured in environment');
        return res.status(500).json({
          success: false,
          error: 'Faucet not configured. Please contact administrator.',
          timestamp: Date.now()
        });
      }

      if (!usdcAddress) {
        logger.error('USDC_TOKEN_ADDRESS not configured in environment');
        return res.status(500).json({
          success: false,
          error: 'USDC token address not configured. Please contact administrator.',
          timestamp: Date.now()
        });
      }

      // Create account from private key
      const account = privateKeyToAccount(faucetPrivateKey as `0x${string}`);

      // Create wallet client
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(rpcUrl),
      });

      // Create public client for waiting transaction
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl),
      });

      // Parse amount (USDC has 6 decimals)
      const amountToSend = parseUnits(CLAIM_AMOUNT, 6);

      const faucetTokenBalance = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      });

      if (faucetTokenBalance < amountToSend) {
        logger.warn('Faucet has insufficient USDC balance');
        return res.status(500).json({
          success: false,
          error: 'Faucet has insufficient USDC balance. Please contact administrator.',
          timestamp: Date.now()
        });
      }

      logger.info(`Transferring ${CLAIM_AMOUNT} USDC to ${trimmedAddress}...`);

      // Transfer USDC from faucet wallet to user
      const hash = await walletClient.writeContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [trimmedAddress as `0x${string}`, amountToSend],
      });

      logger.info(`Transaction submitted: ${hash}`);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1
      });

      if (receipt.status !== 'success') {
        throw new Error('Faucet transfer reverted');
      }

      claimTimestamps.set(normalizedAddress, Date.now());

      logger.success(`Successfully transferred ${CLAIM_AMOUNT} USDC to ${trimmedAddress}`);

      return res.json({
        success: true,
        data: {
          transactionHash: hash,
          amount: CLAIM_AMOUNT,
          recipient: trimmedAddress,
          status: receipt.status,
          blockNumber: receipt.blockNumber.toString(),
          explorerUrl: `https://sepolia.basescan.org/tx/${hash}`
        },
        message: `Successfully claimed ${CLAIM_AMOUNT} USDC`,
        timestamp: Date.now()
      });

    } catch (error: any) {
      logger.error('Error claiming from faucet:', error);

      let errorMessage = 'Failed to claim USDC from faucet';

      if (error?.message?.includes('transfer')) {
        errorMessage = 'Token transfer failed. Please try again later.';
      } else if (error?.message?.includes('insufficient funds')) {
        errorMessage = 'Faucet has insufficient funds. Please contact administrator.';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      return res.status(500).json({
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      });
    }
  });

  /**
   * GET /api/faucet/status
   * Get faucet status and configuration
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;
      const usdcAddress = process.env.USDC_TOKEN_ADDRESS;

      if (!faucetPrivateKey) {
        return res.json({
          success: true,
          data: {
            enabled: false,
            message: 'Faucet not configured'
          },
          timestamp: Date.now()
        });
      }

      if (!usdcAddress) {
        return res.json({
          success: true,
          data: {
            enabled: false,
            message: 'USDC token address not configured'
          },
          timestamp: Date.now()
        });
      }

      const account = privateKeyToAccount(faucetPrivateKey as `0x${string}`);
      const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';

      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl),
      });

      // Get faucet ETH balance
      const balance = await publicClient.getBalance({
        address: account.address,
      });

      const faucetTokenBalance = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      });

      const addressParam = typeof req.query.address === 'string' ? req.query.address : '';
      const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(addressParam);
      const normalizedParam = isValidAddress ? addressParam.toLowerCase() : null;
      const lastClaimAt = normalizedParam ? claimTimestamps.get(normalizedParam) : undefined;
      const nextClaimAt = lastClaimAt ? lastClaimAt + COOLDOWN_MS : undefined;

      return res.json({
        success: true,
        data: {
          enabled: true,
          faucetAddress: account.address,
          ethBalance: (Number(balance) / 1e18).toFixed(6),
          usdcBalance: (Number(faucetTokenBalance) / 1e6).toFixed(2),
          claimAmount: CLAIM_AMOUNT,
          cooldownSeconds: Math.floor(COOLDOWN_MS / 1000),
          lastClaimAt,
          nextClaimAt,
          network: 'Base Sepolia',
          chainId: 84532
        },
        timestamp: Date.now()
      });

    } catch (error: any) {
      logger.error('Error getting faucet status:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get faucet status',
        timestamp: Date.now()
      });
    }
  });

  return router;
}
