## ADDED Requirements

### Requirement: Backend exposes an HTTP server on port 3001
`tethra-be` SHALL start an Express HTTP server on port `3001` (configurable via `PORT` env var) in the same process as the solver services. The server SHALL include `cors()` middleware allowing all origins.

#### Scenario: Server starts with solver
- **WHEN** `npm run dev` or `npm start` is run
- **THEN** the Express server starts on port 3001
- **THEN** all solver services (BetScanner, PriceWatcher, Settler, ExpiryCleanup) also start
- **THEN** a log line confirms the HTTP server is listening

#### Scenario: CORS headers present
- **WHEN** the frontend at `http://localhost:3000` calls any API endpoint
- **THEN** the response includes `Access-Control-Allow-Origin: *`

### Requirement: GET /api/one-tap/active returns all active bets
The route SHALL return all bets currently tracked as active by the in-memory BetScanner registry. If BetScanner has not finished syncing, the response SHALL include `syncing: true`.

#### Scenario: Active bets available
- **WHEN** `GET /api/one-tap/active` is called and BetScanner has synced
- **THEN** the response is `{ success: true, data: [ ...bets ] }` with HTTP 200
- **THEN** each bet object includes `betId`, `trader`, `symbol`, `direction`, `betAmount`, `targetPrice`, `entryPrice`, `entryTime`, `targetTime`, `multiplier`, `status`

#### Scenario: BetScanner still syncing
- **WHEN** `GET /api/one-tap/active` is called before BetScanner finishes initial sync
- **THEN** the response is `{ success: true, data: [], syncing: true }` with HTTP 200

### Requirement: GET /api/one-tap/bets returns bets for a specific trader
The route SHALL accept a `trader` query param and return that address's bets by querying `TapBetManager` on-chain via a viem public client.

#### Scenario: Trader has bets
- **WHEN** `GET /api/one-tap/bets?trader=0x...` is called with a valid address
- **THEN** the response is `{ success: true, data: [ ...bets ] }` with HTTP 200
- **THEN** the bets include both active and settled entries for that trader

#### Scenario: Missing trader param
- **WHEN** `GET /api/one-tap/bets` is called without the `trader` query param
- **THEN** the response is `{ success: false, error: "trader address required" }` with HTTP 400

#### Scenario: Trader has no bets
- **WHEN** `GET /api/one-tap/bets?trader=0x...` is called for an address with no bets
- **THEN** the response is `{ success: true, data: [] }` with HTTP 200

### Requirement: GET /api/price/all returns latest oracle prices
The route SHALL return the current in-memory oracle prices from PriceWatcher for all tracked symbols.

#### Scenario: Prices available
- **WHEN** `GET /api/price/all` is called after PriceWatcher has received at least one update
- **THEN** the response is `{ success: true, data: { BTC: { price, timestamp, source }, ETH: { ... } } }` with HTTP 200
