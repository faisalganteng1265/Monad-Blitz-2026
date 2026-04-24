## ADDED Requirements

### Requirement: ExpiryCleanup runs every 30s and calls batchSettleExpired
`tethra-be/src/services/ExpiryCleanup.ts` MUST be created. It MUST run on a setInterval of `EXPIRY_CLEANUP_INTERVAL_MS` (default 30000). On each tick it SHALL filter `activeBets` where `Date.now()/1000 > bet.expiry`, collect betIds, and call `TapBetManager.batchSettleExpired(betIds[])` via Viem walletClient in batches of up to `MAX_BATCH_SIZE`.

#### Scenario: Cleanup submits batch for expired bets
- **WHEN** 30s interval fires and 15 bets are expired
- **THEN** one `batchSettleExpired` call with all 15 betIds is submitted

#### Scenario: Cleanup skipped when no expired bets
- **WHEN** no active bets are past expiry
- **THEN** no transaction submitted

#### Scenario: Large batch split into MAX_BATCH_SIZE chunks
- **WHEN** 150 bets are expired and MAX_BATCH_SIZE is 100
- **THEN** two calls are submitted: first with 100, second with 50

### Requirement: tethra-be index.ts is rewritten as solver entry point (no Express server)
`tethra-be/src/index.ts` MUST be rewritten to start BetScanner, PriceWatcher (adapted from PythPriceService), WinDetector, Settler, and ExpiryCleanup in sequence. It MUST NOT start an HTTP server or mount Express routes.

#### Scenario: Solver starts all services successfully
- **WHEN** `npm run start` executes in tethra-be
- **THEN** all 5 services start, BetScanner syncs from chain, PriceWatcher connects to Pyth WebSocket, no HTTP port bound

#### Scenario: Missing env vars fail fast
- **WHEN** PRIVATE_KEY or TAP_BET_MANAGER env var is missing
- **THEN** process exits with a clear error before starting any service
