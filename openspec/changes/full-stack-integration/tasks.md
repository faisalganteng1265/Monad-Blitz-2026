## 1. Frontend — Faucet On-Chain

- [x] 1.1 Add `MOCK_USDC_ABI` with `faucet()` function to `Tethra-Front-End/src/config/contracts.ts`
- [x] 1.2 Rewrite `useUSDCFaucet.tsx` to use wagmi `useWriteContract` + `usePublicClient` to call `MockUSDC.faucet()` directly instead of calling the backend endpoint
- [x] 1.3 After tx confirms, dispatch `tethra:refreshBalance` event and show Monad Explorer link in success toast
- [x] 1.4 Update `ClaimUSDCButton.tsx` error message to reflect contract revert reason instead of HTTP error

## 2. Backend — Install Dependencies & HTTP Server

- [x] 2.1 Add `express`, `cors`, `ws` and their `@types/*` packages to `tethra-be/package.json`
- [x] 2.2 Create `tethra-be/src/server.ts` that exports a `createServer(services)` function which builds and returns the Express app + WebSocket server
- [x] 2.3 Update `tethra-be/src/index.ts` to call `createServer({ scanner, priceWatcher })` and call `server.listen(PORT)` after all solver services have started

## 3. Backend — REST Routes

- [x] 3.1 Create `tethra-be/src/routes/bets.ts` — `GET /api/one-tap/active` reads from `BetScanner.getActiveBets()` and returns `{ success, data, syncing? }`
- [x] 3.2 Create `tethra-be/src/routes/bets.ts` (same file) — `GET /api/one-tap/bets?trader=` queries `TapBetManager` on-chain via viem public client using `getLogs` for `BetPlaced` events filtered by trader, then fetches each bet's current state
- [x] 3.3 Create `tethra-be/src/routes/prices.ts` — `GET /api/price/all` returns current in-memory oracle prices from a shared price store that `PriceWatcher` writes to
- [x] 3.4 Register all routes in `server.ts` with `app.use('/api/one-tap', betsRouter)` and `app.use('/api', pricesRouter)`
- [x] 3.5 Add 400 validation for missing `trader` param in bets route

## 4. Backend — WebSocket Price Stream

- [x] 4.1 In `server.ts`, create a `ws.Server({ noServer: true })` and handle the `upgrade` event on the HTTP server for path `/ws/price`
- [x] 4.2 Wire `priceWatcher.onPriceUpdate(update => broadcast(update))` so every Pyth tick is sent to all connected WS clients as `{ type: "price_update", data: { [SYMBOL]: { price, confidence, timestamp, source } } }`
- [x] 4.3 Handle client `close` event to remove disconnected clients from the broadcast set

## 5. Backend — BetScanner Shared State

- [x] 5.1 Ensure `BetScanner` exposes `getActiveBets(): BetData[]` and `isSyncing(): boolean` methods (add if missing)
- [x] 5.2 Ensure `PriceWatcher` exposes `getLatestPrices(): Record<string, OraclePrice>` so the REST route can read prices without a separate store (add if missing)

## 6. Integration Verification

- [x] 6.1 Start `tethra-be` with `npm run dev` and confirm HTTP server logs on port 3001
- [x] 6.2 Call `GET http://localhost:3001/api/one-tap/active` and confirm valid JSON response
- [x] 6.3 Call `GET http://localhost:3001/api/price/all` and confirm BTC/ETH prices are present
- [x] 6.4 Connect to `ws://localhost:3001/ws/price` (e.g. with `wscat`) and confirm `price_update` messages arrive
- [ ] 6.5 Start frontend, connect wallet, click Faucet, confirm MockUSDC balance increases on Monad Explorer
- [ ] 6.6 Place a bet via the chart, confirm it appears in "Your Position" panel (via `/api/one-tap/bets`)
- [ ] 6.7 Wait for bet to expire or price to hit target; confirm solver settles it and status updates in UI
