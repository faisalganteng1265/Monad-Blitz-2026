## ADDED Requirements

### Requirement: Backend streams live prices over WebSocket at /ws/price
The backend SHALL upgrade HTTP connections at `/ws/price` to WebSocket and broadcast a `price_update` message to all connected clients on every Pyth oracle tick from `PriceWatcher`.

#### Scenario: Client connects and receives price updates
- **WHEN** a client opens a WebSocket connection to `ws://localhost:3001/ws/price`
- **THEN** the connection is accepted
- **THEN** on each Pyth price update the server sends `{ type: "price_update", data: { BTC: { symbol, price, confidence, timestamp, source }, ... } }`

#### Scenario: Multiple clients connected
- **WHEN** more than one client is connected
- **THEN** all clients receive the same broadcast on each price tick

#### Scenario: Client disconnects cleanly
- **WHEN** a connected client closes its WebSocket
- **THEN** the server removes it from the broadcast list without affecting other clients

### Requirement: Frontend connects to /ws/price for oracle price display
The frontend's `useMarketWebSocket` (or equivalent hook) SHALL connect to `ws://localhost:3001/ws/price` and update `oraclePrices` state on each `price_update` message, replacing or supplementing the existing Pyth direct connection.

#### Scenario: Message received and parsed
- **WHEN** a `price_update` message arrives on the WebSocket
- **THEN** `oraclePrices` state is updated with the new prices keyed by uppercase symbol (e.g., `"BTC"`)
- **THEN** the live price display in the chart header updates within one render cycle

#### Scenario: Backend offline
- **WHEN** the WebSocket connection to the backend cannot be established
- **THEN** the frontend falls back silently (existing Binance WebSocket prices continue to display)
- **THEN** a console warning is logged but no error is shown to the user
