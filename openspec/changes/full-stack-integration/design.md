## Context

The Tethra stack has three layers: smart contracts (Foundry, deployed on Monad Testnet), a Node.js solver (`tethra-be`), and a Next.js frontend (`Tethra-Front-End`). Contracts are live. The solver (`index.ts`) boots BetScanner, PriceWatcher, WinDetector, Settler, and ExpiryCleanup but exposes **no HTTP interface** — the `routes/` folder is empty and there is no Express server. The frontend currently calls `http://localhost:3001/api/...` endpoints that do not exist, causing silent failures for faucet, bet listing, and price streaming.

Key constraints:
- Must not change deployed contracts.
- Backend solver logic (BetScanner, Settler, etc.) must keep working unchanged.
- Frontend already uses wagmi/viem for contract writes; we should extend that pattern.

## Goals / Non-Goals

**Goals:**
- Users can claim test USDC without the backend (direct on-chain call).
- Backend exposes REST + WebSocket so the frontend shows live bet data and prices.
- Solver continues to run alongside the HTTP server in the same process.

**Non-Goals:**
- Authentication / API keys on backend routes (testnet demo, open endpoints are fine).
- Persistent database — bet data is read from chain / in-memory BetScanner state.
- Production deployment of the backend (localhost for hackathon testing).

## Decisions

### 1. Faucet: on-chain call from frontend, not backend relay

**Decision**: Call `MockUSDC.faucet()` directly via wagmi `writeContract` in the frontend.

**Rationale**: The backend faucet endpoint was a relay that called the same function server-side. Cutting the backend out removes a failure point. The function is permissionless (anyone can call it for themselves), so no server-side auth needed. Simpler, faster to implement.

**Alternative considered**: Keep backend relay. Rejected — adds latency, requires backend running just for faucet, no benefit.

### 2. Backend HTTP server: Express co-located in existing `index.ts` process

**Decision**: Add Express + `ws` library to `tethra-be`. Start the HTTP server in `main()` after solver services are initialised. Routes read from BetScanner's in-memory registry and query the chain via viem public client.

**Rationale**: Single process is simplest — PriceWatcher's `onPriceUpdate` callback is already in-memory; wiring it to a WebSocket broadcast requires no IPC. BetScanner maintains `activeBets: Map<string, BetData>` which routes can read directly.

**Alternative considered**: Separate API process. Rejected — requires shared state mechanism (Redis/IPC), overkill for hackathon.

### 3. `/api/one-tap/bets`: on-chain query, not BetScanner cache

**Decision**: Call `TapBetManager.getActiveBets(trader)` (or iterate bet IDs via events) using a viem public client in the route handler.

**Rationale**: BetScanner only tracks currently active bets in memory; it doesn't store historical/settled bets. An on-chain query returns the full history the frontend needs for "Your Position" panel.

**Alternative considered**: Use BetScanner map filtered by trader. Rejected — misses settled/expired bets that the user wants to see.

### 4. `/ws/price`: tap into existing PriceWatcher callback

**Decision**: In `index.ts`, after `priceWatcher.start()`, register an additional `onPriceUpdate` listener that broadcasts the price JSON to all connected WebSocket clients.

**Rationale**: PriceWatcher already normalises and emits prices on each Pyth tick. Re-using the callback avoids duplicating Pyth subscription logic.

## Risks / Trade-offs

- **BetScanner startup lag** → `/api/one-tap/active` returns empty until BetScanner has synced historical events on boot. Mitigation: route returns `{ data: [], syncing: true }` until sync completes; frontend shows a loading state.
- **`MockUSDC.faucet()` has cooldown** → contract may enforce a per-address cooldown. Mitigation: catch the revert in the frontend and show a human-readable error.
- **CORS on localhost** → browser will block frontend (port 3000) calling backend (port 3001). Mitigation: add `cors()` middleware to Express, allow `*` for testnet.
- **wagmi `writeContract` for faucet needs connected wallet** → user must be authenticated before claiming. Mitigation: faucet button is already hidden when not authenticated.

## Migration Plan

1. Install `express`, `cors`, `ws`, `@types/*` in `tethra-be`.
2. Add route files under `tethra-be/src/routes/`.
3. Update `index.ts` to start HTTP server and wire WebSocket.
4. Update frontend `useUSDCFaucet` / `ClaimUSDCButton` to use wagmi direct call.
5. Test end-to-end: claim USDC → place bet → watch solver settle → bet appears in history.

**Rollback**: Frontend faucet change is isolated to one hook/component; reverting to backend call is a two-line change. Backend HTTP server is additive — removing it leaves the solver unchanged.

## Open Questions

- Does `TapBetManager` expose a getter for all bets by trader address, or do we need to filter `BetPlaced` events? (Check ABI before implementing route.)
- What port should the backend listen on? (`3001` matches the existing `NEXT_PUBLIC_BACKEND_URL` default.)
