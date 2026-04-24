import 'dotenv/config';
import { keccak256, toBytes } from 'viem';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  privateKey:          requireEnv('PRIVATE_KEY') as `0x${string}`,
  rpcUrl:              requireEnv('RPC_URL'),
  tapBetManager:       requireEnv('TAP_BET_MANAGER') as `0x${string}`,
  tapVault:            requireEnv('TAP_VAULT') as `0x${string}`,
  priceAdapter:        requireEnv('PRICE_ADAPTER') as `0x${string}`,
  pythHermesUrl:       process.env.PYTH_HERMES_URL ?? 'https://hermes.pyth.network',
  pythBtcPriceId:      process.env.PYTH_BTC_PRICE_ID ?? '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  pythEthPriceId:      process.env.PYTH_ETH_PRICE_ID ?? '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  pythMonPriceId:      process.env.PYTH_MON_PRICE_ID ?? '',
  expiryCleanupMs:     parseInt(process.env.EXPIRY_CLEANUP_INTERVAL_MS ?? '30000'),
  maxBatchSize:        parseInt(process.env.MAX_BATCH_SIZE ?? '100'),
} as const;

// ─── ABI (inline from forge artifacts) ────────────────────────────────────────

export const TAP_BET_MANAGER_ABI = [
  { type: 'function', name: 'getActiveBets', inputs: [], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getBet', inputs: [{ name: 'betId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [
    { name: 'betId', type: 'uint256' },
    { name: 'user', type: 'address' },
    { name: 'symbol', type: 'bytes32' },
    { name: 'targetPrice', type: 'uint256' },
    { name: 'collateral', type: 'uint256' },
    { name: 'multiplier', type: 'uint256' },
    { name: 'direction', type: 'uint8' },
    { name: 'expiry', type: 'uint256' },
    { name: 'status', type: 'uint8' },
    { name: 'placedAt', type: 'uint256' },
  ]}], stateMutability: 'view' },
  { type: 'function', name: 'settleBetWin', inputs: [{ name: 'betId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'batchSettleExpired', inputs: [{ name: 'betIds', type: 'uint256[]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'settleExpired', inputs: [{ name: 'betId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'event', name: 'BetPlaced', inputs: [
    { name: 'betId', type: 'uint256', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'symbol', type: 'bytes32', indexed: true },
    { name: 'targetPrice', type: 'uint256', indexed: false },
    { name: 'collateral', type: 'uint256', indexed: false },
    { name: 'multiplier', type: 'uint256', indexed: false },
    { name: 'direction', type: 'uint8', indexed: false },
    { name: 'expiry', type: 'uint256', indexed: false },
  ], anonymous: false },
  { type: 'event', name: 'BetWon', inputs: [
    { name: 'betId', type: 'uint256', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'settler', type: 'address', indexed: true },
    { name: 'payout', type: 'uint256', indexed: false },
    { name: 'settlerFee', type: 'uint256', indexed: false },
  ], anonymous: false },
  { type: 'event', name: 'BetExpired', inputs: [
    { name: 'betId', type: 'uint256', indexed: true },
    { name: 'user', type: 'address', indexed: true },
  ], anonymous: false },
] as const;

// Symbol name → keccak256 bytes32 mapping (mirrors PriceAdapter.setPriceId logic)
export const SYMBOL_BYTES32: Record<string, `0x${string}`> = {
  BTC: keccak256(toBytes('BTC')),
  ETH: keccak256(toBytes('ETH')),
  MON: keccak256(toBytes('MON')),
};

// Reverse map: bytes32 → symbol name
export const BYTES32_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_BYTES32).map(([sym, hash]) => [hash, sym])
);

// Map symbol name → Pyth price feed ID
export function getPythPriceId(symbol: string): string | undefined {
  const map: Record<string, string> = {
    BTC: config.pythBtcPriceId,
    ETH: config.pythEthPriceId,
    MON: config.pythMonPriceId,
  };
  return map[symbol];
}
