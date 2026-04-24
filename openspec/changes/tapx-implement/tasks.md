## 1. Smart Contracts — Cleanup and Dependencies

- [x] 1.1 Delete `tethra-sc/src/treasury/StabilityFund.sol` — not used in TapX architecture
- [x] 1.2 Delete `tethra-sc/test/OneTapProfitPrivate.t.sol` — tests for deleted contract
- [x] 1.3 Add Pyth Solidity SDK: `cd tethra-sc && forge install pyth-network/pyth-crosschain` and update `foundry.toml` remappings for `@pythnetwork/pyth-solidity-sdk`
- [x] 1.4 Update `tethra-sc/foundry.toml` — add Monad testnet RPC under `[rpc_endpoints]`, set Solidity 0.8.24

## 2. MultiplierEngine.sol — New Contract

- [x] 2.1 Create `tethra-sc/src/trading/MultiplierEngine.sol` with 6-band × 5-bucket `multiplierTable[6][5]` populated with the exact values from tapx-docs CONTRACTS.md (bands: 0-0.5%, 0.5-1%, 1-2%, 2-5%, 5-10%, >10%; buckets: 1m, 5m, 15m, 30m, 1h)
- [x] 2.2 Implement `_getPriceBand(uint256 distanceBps) internal pure returns (uint8)` with correct band boundaries
- [x] 2.3 Implement `_getTimeBucket(uint256 timeToExpiry) internal pure returns (uint8)` for 5 time buckets
- [x] 2.4 Implement `getMultiplier(uint256 currentPrice, uint256 targetPrice, uint256 timeToExpiry) external view returns (uint256)` — uses absolute distance, symmetric UP/DOWN
- [x] 2.5 Implement `setMultiplier(uint8 priceBand, uint8 timeBucket, uint256 multiplier) external onlyOwner`
- [x] 2.6 Write `tethra-sc/test/MultiplierEngine.t.sol` — test all 30 cells, band boundary edge cases, setMultiplier access control

## 3. PriceAdapter.sol — New Contract

- [x] 3.1 Create `tethra-sc/test/mocks/MockPyth.sol` — implements Pyth IPyth interface with settable price/publishTime/confidence for tests
- [x] 3.2 Create `tethra-sc/src/trading/PriceAdapter.sol` wrapping `IPyth` — store `maxPriceAge = 30` and `maxConfidenceBps = 100`, store `pythContract` address
- [x] 3.3 Implement `setPriceId(bytes32 symbol, bytes32 pythPriceId) external onlyOwner` — stores symbol→priceId mapping
- [x] 3.4 Implement `verifyAndGetPrice(bytes[] calldata priceUpdateData, bytes32 priceId) external payable returns (uint256 price, uint256 publishTime)` — calls `pyth.updatePriceFeeds`, then `pyth.getPriceNoOlderThan`, validates age and confidence, returns 8-decimal price
- [x] 3.5 Implement `getLatestPrice(bytes32 priceId) external view returns (uint256 price, uint256 publishTime)` — cached price for display
- [x] 3.6 Write `tethra-sc/test/PriceAdapter.t.sol` — test valid proof, stale proof, wide confidence, invalid feed, setPriceId access control using MockPyth

## 4. TapVault.sol — Adapt VaultPool

- [x] 4.1 Copy `tethra-sc/src/treasury/VaultPool.sol` to `tethra-sc/src/treasury/TapVault.sol`
- [x] 4.2 Remove from TapVault: `virtualSupply`, `lockPeriod`, `earlyExitFeeBps`, `streamToVault()`, `receiveFromSettlement()`, `apyEstimateBps`, `totalYieldAccrued`, `lastYieldAt`, `unlockTime()`, `isUnlocked()`, `updateLockPeriod()`, `updateEarlyExitFee()`, `updateApyEstimate()`, all related events
- [x] 4.3 Replace `SETTLER_ROLE` with a single `address public betManager` state var; add `setBetManager(address) external onlyOwner`
- [x] 4.4 Add `collectCollateral(uint256 amount) external` — restricted to `betManager`, calls `usdc.safeTransferFrom(betManager caller's context → vault)`. Note: BetManager holds user-approved USDC; vault pulls from BetManager. Actually BetManager transfers on behalf of user: implement as `usdc.safeTransferFrom(tx.origin_user, address(this), amount)` — wait, review: BetManager should call `usdc.transferFrom(user, vault, amount)`. Implement `collectCollateral` to accept the amount and expect BetManager handles the transferFrom.
- [x] 4.5 Add `payout(address to, uint256 amount) external` — restricted to `betManager`, reverts if `usdc.balanceOf(address(this)) < amount`, calls `usdc.safeTransfer(to, amount)`, emits `PayoutIssued`
- [x] 4.6 Add `canCoverPayout(uint256 amount) external view returns (bool)` — returns `usdc.balanceOf(address(this)) >= amount`
- [x] 4.7 Emit `CollateralCollected(uint256 amount)` in `collectCollateral`
- [x] 4.8 Delete `tethra-sc/src/treasury/VaultPool.sol` (renamed to TapVault)
- [x] 4.9 Write `tethra-sc/test/TapVault.t.sol` — test deposit/withdraw LP shares, collectCollateral, payout, payout-reverts-on-insufficient, setBetManager access control, share value increases after losses

## 5. TapBetManager.sol — Replace OneTapProfit

- [x] 5.1 Delete `tethra-sc/src/trading/OneTapProfit.sol`
- [x] 5.2 Create `tethra-sc/src/trading/TapBetManager.sol` with `Direction` enum (UP/DOWN), `BetStatus` enum (ACTIVE/WON/EXPIRED), `Bet` struct (betId, user, symbol bytes32, targetPrice, collateral, multiplier, direction, expiry, status, placedAt)
- [x] 5.3 Add storage: `mapping(uint256 => Bet) public bets`, `mapping(address => uint256[]) public userBets`, `uint256[] public activeBetIds`, `uint256 public nextBetId`, `address public vault`, `address public priceAdapter`, `address public multiplierEngine`, `uint256 public SETTLER_FEE_BPS = 50`
- [x] 5.4 Implement `placeBet(bytes32 symbol, uint256 targetPrice, uint256 expiry, uint256 expectedMultiplier) external returns (uint256 betId)` — read current price from PriceAdapter cache, derive direction, validate multiplier ±1% vs MultiplierEngine output, call `vault.collectCollateral(collateral)` (user must have pre-approved TapBetManager for USDC), store bet, emit `BetPlaced`
- [x] 5.5 Implement `settleBetWin(uint256 betId, bytes[] calldata priceUpdateData) external` — call `priceAdapter.verifyAndGetPrice`, validate win condition, validate `block.timestamp <= expiry`, compute payout and settlerFee, call `vault.payout(user, payout-settlerFee)` and `vault.payout(msg.sender, settlerFee)`, remove from activeBetIds, emit `BetWon`
- [x] 5.6 Implement `settleExpired(uint256 betId) external` — validate `block.timestamp > expiry` and `status == ACTIVE`, update to EXPIRED, remove from activeBetIds, emit `BetExpired`
- [x] 5.7 Implement `batchSettleExpired(uint256[] calldata betIds) external` — loop with continue (not revert) for non-eligible bets
- [x] 5.8 Implement `getBet(uint256 betId)`, `getActiveBets()`, `getUserBets(address)` views
- [x] 5.9 Add `ReentrancyGuard` to `placeBet`, `settleBetWin`; add `Pausable` to `placeBet`; use `SafeERC20`
- [x] 5.10 Write `tethra-sc/test/TapBetManager.t.sol` — test placeBet UP/DOWN, multiplier accepts/rejects at 1% tolerance, settleBetWin UP/DOWN, price-not-reached revert, already-settled revert, settleExpired before/after expiry, batchSettleExpired mixed batch, settler fee calculation

## 6. Integration Tests and Deploy Script

- [x] 6.1 Write `tethra-sc/test/Integration.t.sol` — full flow: deploy all 4 contracts with MockUSDC + MockPyth → seed vault → placeBet → advance price in MockPyth → settleBetWin → verify user balance
- [x] 6.2 Write expiry integration test: placeBet → advance time past expiry → settleExpired → verify collateral stays in vault
- [x] 6.3 Write vault liquidity exhaustion test: payout reverts when vault empty
- [x] 6.4 Create `tethra-sc/script/Deploy.s.sol` — deploy in order: PriceAdapter(pythContract) → MultiplierEngine() → TapVault(usdc) → TapBetManager(vault, priceAdapter, multiplierEngine, usdc); log all addresses
- [x] 6.5 Add post-deploy calls in script: `tapVault.setBetManager(address(tapBetManager))`, `priceAdapter.setPriceId(keccak256("BTC"), BTC_PYTH_ID)`, `priceAdapter.setPriceId(keccak256("ETH"), ETH_PYTH_ID)`
- [x] 6.6 Update `tethra-sc/.env.example` with `PYTH_CONTRACT`, `USDC_ADDRESS`, `PRIVATE_KEY`, `RPC_URL` for Monad testnet
- [x] 6.7 Run `forge build` — fix any compilation errors
- [x] 6.8 Run `forge test` — all tests green; run `forge test --fuzz-runs 500` for multiplier math

## 7. Solver — Strip Backend, Update Dependencies

- [x] 7.1 Delete from `tethra-be/src/`: `routes/faucet.ts`, `routes/oneTapProfit.ts`, `routes/price.ts`, `routes/relay.ts`, `services/OneTapProfitMonitor.ts`, `services/OneTapProfitService.ts`, `services/RelayService.ts`, `services/SessionKeyValidator.ts`, `services/StabilityFundStreamer.ts`, `services/PriceSignerService.ts`, `services/ChainlinkPriceService.ts`
- [x] 7.2 Remove `ethers`, `express`, `cors`, `node-fetch`, `ws` (ws already part of hermes-client) from `tethra-be/package.json`; add `@pythnetwork/pyth-evm-js`; ensure `viem` is present
- [x] 7.3 Update `tethra-be/src/types/index.ts` — replace old types with `ActiveBet { betId: bigint, symbol: string, targetPrice: bigint, expiry: bigint, direction: 'UP' | 'DOWN', collateral: bigint }`
- [x] 7.4 Update `tethra-be/.env.example` with: `PRIVATE_KEY`, `RPC_URL=https://testnet-rpc.monad.xyz`, `TAP_BET_MANAGER=0x...`, `TAP_VAULT=0x...`, `PRICE_ADAPTER=0x...`, `PYTH_HERMES_URL=https://hermes.pyth.network`, `PYTH_BTC_PRICE_ID`, `PYTH_ETH_PRICE_ID`, `EXPIRY_CLEANUP_INTERVAL_MS=30000`, `MAX_BATCH_SIZE=100`
- [x] 7.5 Create `tethra-be/src/config.ts` — loads and validates all env vars; exports typed config object with ABI imports from `tethra-sc` artifacts or inline ABIs

## 8. Solver — PriceWatcher (adapt PythPriceService)

- [x] 8.1 Create `tethra-be/src/services/PriceWatcher.ts` by adapting `PythPriceService.ts` — keep WebSocket connection logic, remove HTTP server interaction, expose `onPriceUpdate(symbol, price)` callback for WinDetector
- [x] 8.2 Keep auto-reconnect logic from existing `PythPriceService.ts` (exponential backoff)
- [x] 8.3 Remove `PythPriceService.ts` after `PriceWatcher.ts` is verified working (or keep and import from it)

## 9. Solver — BetScanner

- [x] 9.1 Create `tethra-be/src/services/BetScanner.ts` — create Viem `publicClient` using Monad testnet RPC
- [x] 9.2 Implement startup sync: call `readContract` for `getActiveBets()`, then `getBet(betId)` for each, populate `activeBets: Map<bigint, ActiveBet>`
- [x] 9.3 Implement `watchContractEvent` for `BetPlaced` — add to activeBets map on each log
- [x] 9.4 Implement `watchContractEvent` for `BetWon` and `BetExpired` — remove from activeBets map on each log
- [x] 9.5 Export `getActiveBets()` method returning the current map for use by WinDetector and ExpiryCleanup

## 10. Solver — WinDetector and Settler

- [x] 10.1 Create `tethra-be/src/services/WinDetector.ts` — on each price update, iterate activeBets for matching symbol, check UP/DOWN win condition AND expiry, add to `settleQueue: Set<bigint>`
- [x] 10.2 Create `tethra-be/src/services/Settler.ts` — create Viem `walletClient` using `privateKeyToAccount(PRIVATE_KEY)` and Monad testnet transport
- [x] 10.3 Implement proof fetch: GET `https://hermes.pyth.network/v2/updates/price/latest?ids[]={priceId}` using `@pythnetwork/hermes-client` or plain fetch; parse `binary.data` as `bytes[]`
- [x] 10.4 Implement pre-simulation: call `simulateContract` before `writeContract` to detect already-settled bets; skip if simulation reverts
- [x] 10.5 Implement `settleBetWin(betId, priceUpdateData)` submission via `walletClient.writeContract`
- [x] 10.6 Implement retry-once on stale proof: if tx reverts, re-fetch proof and retry; log and discard on second failure

## 11. Solver — ExpiryCleanup and Entry Point

- [x] 11.1 Create `tethra-be/src/services/ExpiryCleanup.ts` — setInterval for `EXPIRY_CLEANUP_INTERVAL_MS`, filter expired bets from BetScanner's activeBets, call `batchSettleExpired` in chunks of `MAX_BATCH_SIZE` via Viem walletClient
- [x] 11.2 Rewrite `tethra-be/src/index.ts` — remove all Express/HTTP code; wire: instantiate Viem clients, start BetScanner, start PriceWatcher, wire WinDetector to PriceWatcher callbacks, start Settler consuming WinDetector queue, start ExpiryCleanup; graceful SIGINT/SIGTERM shutdown
- [x] 11.3 Run `npm run dev` in tethra-be — verify solver starts, connects to Pyth WebSocket, and no import errors

## 12. Frontend — Chain Config and Contract Setup

- [x] 12.1 Define Monad Testnet chain in `Tethra-Front-End/src/config/` — `const monadTestnet = defineChain({ id: 10143, name: 'Monad Testnet', rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } }, blockExplorers: { default: { url: 'https://testnet.monadexplorer.com' } }, nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 } })`
- [x] 12.2 Update `Tethra-Front-End/src/app/providers.tsx` — replace `baseSepolia` with `monadTestnet`; update wagmi config chains
- [x] 12.3 Update `Tethra-Front-End/src/config/contracts.ts` — remove `STABILITY_FUND_ADDRESS`; add `TAP_BET_MANAGER_ADDRESS`, `TAP_VAULT_ADDRESS`, `MULTIPLIER_ENGINE_ADDRESS`, `PRICE_ADAPTER_ADDRESS` reading from `NEXT_PUBLIC_*` env vars
- [x] 12.4 Update `Tethra-Front-End/.env.example` (or create `.env.local.example`) with new env vars: `NEXT_PUBLIC_TAP_BET_MANAGER`, `NEXT_PUBLIC_TAP_VAULT`, `NEXT_PUBLIC_MULTIPLIER_ENGINE`, `NEXT_PUBLIC_PRICE_ADAPTER`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PYTH_BTC_PRICE_ID`, `NEXT_PUBLIC_PYTH_ETH_PRICE_ID`
- [ ] 12.5 After contracts deployed: export ABIs from `forge build` artifacts and copy to `Tethra-Front-End/src/contracts/abis/` as `TapBetManager.json`, `TapVault.json`, `MultiplierEngine.json`, `PriceAdapter.json`

## 13. Frontend — Multiplier Engine TypeScript Mirror

- [x] 13.1 Create `Tethra-Front-End/src/features/trading/lib/multiplierEngine.ts` — export `MULTIPLIER_TABLE: number[][]`, `getPriceBand(distanceBps: number): number`, `getTimeBucket(timeToExpiry: number): number`, and `getMultiplier(currentPrice: bigint, targetPrice: bigint, timeToExpiry: number): number`
- [x] 13.2 Use identical band boundaries and table values as `MultiplierEngine.sol`
- [x] 13.3 Export `PRICE_BANDS` and `TIME_BUCKETS` constants for use in grid rendering (band labels, time column headers)

## 14. Frontend — Direct Bet Placement Hook

- [x] 14.1 Delete `Tethra-Front-End/src/features/trading/hooks/useOneTapProfitBetting.ts`
- [x] 14.2 Delete `Tethra-Front-End/src/features/wallet/hooks/useSessionKey.ts`
- [x] 14.3 Delete `Tethra-Front-End/src/features/wallet/hooks/usePaymaster.ts`
- [x] 14.4 Delete `Tethra-Front-End/src/lib/relayApi.ts`
- [x] 14.5 Create `Tethra-Front-End/src/features/trading/hooks/usePlaceBet.ts` — use Wagmi `useWriteContract` with TapBetManager ABI; expose `placeBet(symbol, targetPrice, expiry, expectedMultiplier)` function
- [x] 14.6 In `usePlaceBet.ts`: use `useReadContract` to check USDC allowance for TapBetManager; if 0, call `writeContract` to `approve(TAP_BET_MANAGER_ADDRESS, maxUint256)` first and wait for confirmation via `useWaitForTransactionReceipt`
- [x] 14.7 Fix all import errors caused by deleting the old hooks (remove from `TapToTradeContext.tsx`, `TradePageContent.tsx`, `OneTapProfitModal.tsx`)

## 15. Frontend — Trading Grid Component

- [x] 15.1 Delete `Tethra-Front-End/src/features/trading/components/modals/OneTapProfitModal.tsx`
- [x] 15.2 Create `Tethra-Front-End/src/features/trading/components/TradingGrid.tsx` — renders 6 price-band rows × 5 time-bucket columns using `PRICE_BANDS` and `TIME_BUCKETS` from multiplierEngine.ts
- [x] 15.3 Each cell shows `getMultiplier(currentPrice, targetPrice, timeToExpiry)` and absolute target price (e.g. "$69,360")
- [x] 15.4 Add current price row separator between UP cells (above) and DOWN cells (below)
- [x] 15.5 Re-render grid on every Pyth price update (consume from existing `usePrices` hook or `pythDataFeed.ts`)
- [x] 15.6 Apply active bet visual state: highlighted border + pulsing animation on cells with ACTIVE bets
- [x] 15.7 Add countdown timer overlay on active bet cells (seconds remaining = `expiry - Date.now()/1000`)
- [x] 15.8 Wire cell `onClick` to `usePlaceBet.placeBet()` when `session.isActive`, disabled otherwise

## 16. Frontend — Session Controls and Bet Events

- [x] 16.1 Update `Tethra-Front-End/src/features/trading/contexts/TapToTradeContext.tsx` — remove session key / relay logic; keep `isActive`, `asset`, `collateralPerTap` state; simplify `enableBinaryTrading` to just `setIsActive(true)`
- [x] 16.2 Update `Tethra-Front-End/src/features/trading/components/orders/OneTapProfitTab.tsx` (or create `SessionControls.tsx`) — asset selector (BTC/ETH/MON dropdown), collateral presets (5/10/50 USDC buttons), custom amount input, Start Trading / Stop Trading button
- [x] 16.3 Remove `isBinaryTradingEnabled` prop from any component; replace with `session.isActive` from context
- [x] 16.4 Create `Tethra-Front-End/src/features/trading/hooks/useBetEvents.ts` — `useWatchContractEvent` for `BetWon` (toast win + cell update) and `BetExpired` (cell dim); local `activeBets: Map<betId, CellCoordinates>` state
- [x] 16.5 Add polling fallback in `useBetEvents.ts`: `useReadContract` on `getUserBets(address)` every 5s to sync bet statuses
- [x] 16.6 Wire `TradingGrid.tsx` to `useBetEvents.ts` — pass active bet map to determine which cells have active bets

## 17. Frontend — Wire Everything into Trade Page

- [x] 17.1 Update `Tethra-Front-End/src/app/trade/page.tsx` or `TradePageContent.tsx` — replace old `OneTapProfitTab` / modal usage with `TradingGrid` + `SessionControls`
- [x] 17.2 Add Toaster (sonner) to layout if not already present — for win/loss notifications
- [x] 17.3 Run `npm run check-types` in Tethra-Front-End — fix all TypeScript errors
- [ ] 17.4 Run `npm run dev` — open browser, connect Privy wallet, verify grid renders with live prices
- [ ] 17.5 Verify tap during active session submits a transaction on Monad testnet (can use a test wallet)

## 18. End-to-End Deployment and Smoke Test

- [ ] 18.1 Deploy contracts to Monad testnet: `forge script tethra-sc/script/Deploy.s.sol --rpc-url monad_testnet --broadcast`; record TapBetManager, TapVault, MultiplierEngine, PriceAdapter addresses
- [ ] 18.2 Fill in `Tethra-Front-End/.env.local` and `tethra-be/.env` with deployed addresses
- [ ] 18.3 Seed TapVault with initial USDC liquidity (approve + deposit from deployer wallet)
- [ ] 18.4 Start solver: `cd tethra-be && npm run start` — verify BetScanner syncs 0 active bets, PriceWatcher connects to Pyth
- [ ] 18.5 Start frontend: `cd Tethra-Front-End && npm run dev` — place a bet in the browser (e.g. BTC +2%, 5min, 10 USDC)
- [ ] 18.6 Verify BetPlaced event caught by solver BetScanner
- [ ] 18.7 Wait for solver to detect win condition (or manually advance mock price if using MockPyth in test env)
- [ ] 18.8 Verify BetWon toast appears in frontend within 2 blocks (~2s) of solver settlement
- [ ] 18.9 Verify `settleExpired` is called by ExpiryCleanup after a losing bet expires
