## ADDED Requirements

### Requirement: TradingGrid.tsx renders a 6×5 price grid anchored to live Pyth price
`Tethra-Front-End/src/features/trading/components/TradingGrid.tsx` MUST be created (or replace `OneTapProfitTab.tsx`). It SHALL render 6 price distance rows (±0.5%, ±1%, ±2%, ±5%, ±10%, ±>10%) × 5 time columns (1min, 5min, 15min, 30min, 1hr). Each cell SHALL display its multiplier (from `getMultiplier()` TypeScript function) and absolute target price. The grid MUST re-render on every Pyth price update.

#### Scenario: Grid renders with live BTC price
- **WHEN** Pyth delivers BTC price $68,000
- **THEN** the +2%/5min cell shows targetPrice $69,360 and multiplier 8x

#### Scenario: Grid re-anchors when price moves
- **WHEN** BTC price updates from $68,000 to $68,500
- **THEN** all target prices update automatically without user action

### Requirement: OneTapProfitModal.tsx is deleted; tap fires bet immediately
The file `Tethra-Front-End/src/features/trading/components/modals/OneTapProfitModal.tsx` MUST be deleted. No modal, no confirmation dialog SHALL appear when a grid cell is tapped during an active session. The `onClick` handler SHALL call `placeBet()` directly.

#### Scenario: Tap during active session fires placeBet immediately
- **WHEN** session is active and user clicks a grid cell
- **THEN** `placeBet` hook is called immediately with no intermediate modal

#### Scenario: Tap outside active session is ignored
- **WHEN** session is NOT active and user clicks a grid cell
- **THEN** no transaction submitted

### Requirement: Active bet cells show countdown timer overlay
Grid cells with ACTIVE bets MUST show a countdown in seconds until expiry. The cell MUST use a distinct visual state (highlighted border or pulsing) to distinguish from empty cells.

#### Scenario: Active bet countdown displayed
- **WHEN** a bet is placed on the +2%/5min cell
- **THEN** that cell shows countdown from ~300s down to 0

#### Scenario: Countdown cell transitions to expired state
- **WHEN** countdown reaches 0 before BetExpired event arrives
- **THEN** cell shows a dimmed "expired" visual pending on-chain confirmation
