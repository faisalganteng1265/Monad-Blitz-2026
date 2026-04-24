## Why

Smart contracts are deployed on Monad Testnet and the frontend can place bets, but three critical pieces are missing: users cannot claim test USDC (faucet endpoint doesn't exist), active bets are not displayed (backend REST API has no routes), and winning bets are never settled (solver is not running). Full end-to-end testing is blocked until these gaps are closed.

## What Changes

- **Faucet on-chain**: Replace the broken `POST /api/faucet/claim` call with a direct `MockUSDC.faucet()` contract call from the frontend — no backend needed.
- **Backend HTTP server**: Add an Express server to `tethra-be` exposing REST endpoints and a WebSocket price stream.
- **GET /api/one-tap/bets**: Query `TapBetManager` on-chain and return the trader's bet history.
- **GET /api/one-tap/active**: Return all currently active bets from the in-memory `BetScanner` registry.
- **WS /ws/price**: Broadcast Pyth oracle price updates from `PriceWatcher` to connected frontend clients.
- **Solver startup**: `tethra-be` starts all existing solver services (BetScanner, PriceWatcher, WinDetector, Settler, ExpiryCleanup) alongside the HTTP server.

## Capabilities

### New Capabilities

- `usdc-faucet-onchain`: Frontend calls `MockUSDC.faucet()` directly via wagmi — no backend required for claiming test USDC.
- `backend-rest-api`: Express HTTP server in `tethra-be` with `/api/one-tap/bets`, `/api/one-tap/active`, and `/api/faucet/claim` (on-chain relay).
- `backend-ws-price`: WebSocket endpoint `/ws/price` that streams live Pyth oracle prices from `PriceWatcher` to frontend clients.

### Modified Capabilities

## Impact

- **Frontend**: `useUSDCFaucet.tsx` and `ClaimUSDCButton.tsx` replaced with direct wagmi contract write; `useBinaryOrders.ts` and `SessionControls.tsx` start receiving real data once backend is running.
- **Backend**: `tethra-be/src/index.ts` extended to start an Express HTTP server; new `routes/` files added for bets and faucet; `PriceWatcher` wired to WebSocket broadcast.
- **Dependencies**: `express`, `cors`, `ws` added to `tethra-be`.
- **No contract changes**: All smart contracts remain as deployed.
