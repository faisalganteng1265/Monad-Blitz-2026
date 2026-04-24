## ADDED Requirements

### Requirement: TapToTradeContext manages session state without relay or session keys
`Tethra-Front-End/src/features/trading/contexts/TapToTradeContext.tsx` MUST be simplified. It SHALL track `isActive: boolean`, `asset: string`, and `collateralPerTap: number` in React state. The `enableBinaryTrading` flow (session key creation, relay deposit) MUST be replaced with a simple "Start Trading" toggle. No session key, no relay wallet.

#### Scenario: Start Trading activates session
- **WHEN** user clicks Start Trading with asset and collateral set
- **THEN** `isActive` becomes true and grid becomes interactive

#### Scenario: Stop Trading deactivates session without on-chain call
- **WHEN** user clicks Stop Trading
- **THEN** `isActive` becomes false; no transaction submitted; active bets continue running

### Requirement: SessionControls component provides asset selector and collateral presets
A `SessionControls` component (or update to existing `TradePageContent.tsx`) MUST include: asset selector (BTC/ETH/MON), collateral preset buttons (5, 10, 50 USDC), a custom amount input, and a Start/Stop Trading button. These replace the old "Enable Binary Trading" / session key flow.

#### Scenario: User selects 10 USDC collateral and starts session
- **WHEN** user clicks "10 USDC" preset and then "Start Trading"
- **THEN** every subsequent tap costs exactly 10 USDC collateral

#### Scenario: Changing collateral requires stopping session first
- **WHEN** session is active and user tries to change collateral
- **THEN** UI prevents the change (grays out collateral controls) until session is stopped

### Requirement: All references to isBinaryTradingEnabled and session key in UI are removed
Any prop, state, or condition in trading UI components that checks `isBinaryTradingEnabled` from session key state MUST be replaced with the simpler `session.isActive` check from TapToTradeContext.

#### Scenario: Grid interactivity is gated by isActive, not isBinaryTradingEnabled
- **WHEN** `session.isActive` is false
- **THEN** grid cells are non-interactive regardless of any session key state
