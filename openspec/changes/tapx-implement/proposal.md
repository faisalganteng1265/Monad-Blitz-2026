## Why

The existing Tethra codebase (tethra-sc / tethra-be / Tethra-Front-End) implements a different architecture: bets are settled by a centralized backend keeper with SETTLER_ROLE, price verification is off-chain, the frontend relies on a backend HTTP relay, and the multiplier is a continuous dynamic formula. The tapx-docs specify a fundamentally different design: direct on-chain bet placement by users, Pyth cryptographic proof verified on-chain at settlement, a fixed 6×5 multiplier grid (not a formula), and a permissionless solver. This change retrofits the existing code to match the tapx-docs spec exactly — fixing every function that currently doesn't work for the new flow.

## What Changes

### Smart Contracts (`tethra-sc/`)
- **REPLACE** `OneTapProfit.sol` → `TapBetManager.sol`: remove keeper/meta-tx/CRE/private bet, add Direction enum, bytes32 symbol, activeBetIds[], direct `placeBet()` by user, permissionless `settleBetWin(betId, priceUpdateData)` with Pyth proof, `settleExpired()`, `batchSettleExpired()`, `getActiveBets()`
- **REPLACE** `VaultPool.sol` → `TapVault.sol`: keep LP share logic, add `collectCollateral()`/`payout()` with `onlyBetManager`, add `setBetManager()`, remove streaming/APY/virtual-supply complexity
- **DELETE** `StabilityFund.sol`: TapBetManager talks directly to TapVault; no buffer layer
- **ADD** `MultiplierEngine.sol`: 6×5 fixed table (6 price bands × 5 time buckets), `getMultiplier()`, `setMultiplier()` onlyOwner
- **ADD** `PriceAdapter.sol`: Pyth oracle wrapper, `verifyAndGetPrice()` with staleness + confidence checks, `setPriceId()`, `getLatestPrice()`
- **ADD** Pyth Solidity SDK dependency
- **REPLACE** test suite: new tests for all 4 contracts + Integration test + MockPyth + redeploy MockUSDC as test helper
- **REPLACE** deploy script: ordered deployment (PriceAdapter → MultiplierEngine → TapVault → TapBetManager) + post-deploy config

### Backend / Solver (`tethra-be/`)
- **REPURPOSE** as `tapx-solver/` — strip HTTP server (Express, routes, relay, faucet); keep only solver logic
- **KEEP+ADAPT** `PythPriceService.ts` → `PriceWatcher.ts`: reuse WebSocket connection logic, update to emit per-symbol price events for WinDetector
- **REPLACE** `OneTapProfitMonitor.ts` → split into `BetScanner.ts` + `WinDetector.ts` + `Settler.ts` + `ExpiryCleanup.ts`
- **DELETE** `OneTapProfitService.ts`, `RelayService.ts`, `SessionKeyValidator.ts`, `StabilityFundStreamer.ts`, `PriceSignerService.ts`, `ChainlinkPriceService.ts`, all Express routes
- `BetScanner.ts`: startup sync via Viem (`getActiveBets()`), subscribe to `BetPlaced`/`BetWon`/`BetExpired` events
- `Settler.ts`: fetch Pyth Hermes proof via REST, call `settleBetWin(betId, priceUpdateData)` via Viem wallet client (replace ethers.js with viem)
- `ExpiryCleanup.ts`: 30s interval, call `batchSettleExpired()`
- Replace `ethers` with `viem` throughout; add `@pythnetwork/pyth-evm-js`

### Frontend (`Tethra-Front-End/`)
- **REPLACE** `useOneTapProfitBetting.ts` → `usePlaceBet.ts`: call `TapBetManager.placeBet()` directly via `useWriteContract`, no backend, no meta-tx, no session keys
- **ADD** `useBetEvents.ts`: `useWatchContractEvent` for `BetWon`/`BetExpired`, update active bets locally
- **ADD** `TradingGrid.tsx`: 6×5 grid with live Pyth price overlay, tap = immediate `placeBet()`, active bet countdown timers
- **REPLACE** `OneTapProfitModal.tsx` → remove modal entirely; tap fires bet directly
- **ADD** `useMultiplier.ts`: TypeScript mirror of `MultiplierEngine.sol` (same table, same band logic)
- **ADD** `usePyth.ts`: clean Pyth WebSocket hook using `@pythnetwork/hermes-client` (replaces `pythDataFeed.ts` for grid use)
- **UPDATE** chain config: `baseSepolia` → Monad Testnet (chainId 10143) everywhere (providers, wagmi config, wallet client)
- **UPDATE** `config/contracts.ts`: add TapBetManager, TapVault, MultiplierEngine, PriceAdapter addresses; remove StabilityFund
- **ADD** ABIs for new contracts in `src/contracts/abis/`
- **UPDATE** USDC approval target: `StabilityFund` → `TapBetManager`
- **ADD** `SessionControls` component: asset selector + collateral per tap preset buttons + Start/Stop Trading
- **DELETE** `relayApi.ts`, `useSessionKey.ts`, `usePaymaster.ts`, relay/deposit/withdraw UI

## Capabilities

### New Capabilities
- `contract-tap-bet-manager`: TapBetManager.sol with direct user placeBet, Pyth-proof win settlement, permissionless expiry
- `contract-tap-vault`: TapVault.sol with LP shares, collectCollateral/payout for BetManager only
- `contract-multiplier-engine`: MultiplierEngine.sol 6×5 fixed grid table
- `contract-price-adapter`: PriceAdapter.sol Pyth oracle wrapper with on-chain proof verification
- `solver-bet-scanner`: Viem-based active bet sync from chain events
- `solver-win-settler`: Pyth proof fetch + permissionless settleBetWin submission
- `solver-expiry-cleanup`: 30s batch expiry settlement loop
- `frontend-trading-grid`: 6×5 live price grid with tap-to-bet, countdown timers, no confirmation modal
- `frontend-direct-bet-placement`: useWriteContract-based placeBet calling TapBetManager directly
- `frontend-bet-event-listener`: useWatchContractEvent for BetWon/BetExpired real-time feedback
- `frontend-monad-chain`: Monad Testnet chain config replacing baseSepolia throughout

### Modified Capabilities
- `trading-session`: Remove session key / relay pattern; keep Start/Stop Trading UI state but wire to direct contract calls

## Impact

- **tethra-sc/src/**: 4 files replaced/added, 1 deleted (StabilityFund), 1 rewritten (deploy script), full test suite rewritten
- **tethra-be/src/**: ~12 files deleted (routes, Express, relay services), 5 new solver services written, ethers → viem migration
- **Tethra-Front-End/src/**: chain config change (baseSepolia → Monad), ~4 hooks replaced/added, 2 components replaced/added, ABI files updated, 3 hooks deleted (sessionKey, paymaster, relay)
- **External**: Pyth Hermes proof API, Monad testnet RPC, Privy App ID (existing), MockUSDC already present
