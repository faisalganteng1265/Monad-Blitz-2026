// TapX contract addresses on Monad Testnet
// Set via NEXT_PUBLIC_* env vars in .env.local

export const TAP_BET_MANAGER_ADDRESS = (
  process.env.NEXT_PUBLIC_TAP_BET_MANAGER || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const TAP_VAULT_ADDRESS = (
  process.env.NEXT_PUBLIC_TAP_VAULT || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const MULTIPLIER_ENGINE_ADDRESS = (
  process.env.NEXT_PUBLIC_MULTIPLIER_ENGINE || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const PRICE_ADAPTER_ADDRESS = (
  process.env.NEXT_PUBLIC_PRICE_ADAPTER || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const USDC_ADDRESS = (
  process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

// Pyth price feed IDs
export const PYTH_BTC_PRICE_ID =
  process.env.NEXT_PUBLIC_PYTH_BTC_PRICE_ID ||
  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';

export const PYTH_ETH_PRICE_ID =
  process.env.NEXT_PUBLIC_PYTH_ETH_PRICE_ID ||
  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

export const USDC_DECIMALS = 6;

// Legacy backend URL kept for compatibility with existing hooks
export const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export const CONTRACTS = {
  tapBetManager: TAP_BET_MANAGER_ADDRESS,
  tapVault:      TAP_VAULT_ADDRESS,
  multiplierEngine: MULTIPLIER_ENGINE_ADDRESS,
  priceAdapter:  PRICE_ADAPTER_ADDRESS,
  usdc:          USDC_ADDRESS,
} as const;
