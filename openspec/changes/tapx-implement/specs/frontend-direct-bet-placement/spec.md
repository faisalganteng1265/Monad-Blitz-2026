## ADDED Requirements

### Requirement: usePlaceBet.ts replaces useOneTapProfitBetting.ts for direct contract calls
`Tethra-Front-End/src/features/trading/hooks/usePlaceBet.ts` MUST be created. It SHALL use Wagmi's `useWriteContract` to call `TapBetManager.placeBet(symbol, targetPrice, expiry, expectedMultiplier)` directly on Monad Testnet. It MUST NOT call any backend API endpoint. It MUST NOT use meta-transactions, session keys, or relay wallets.

#### Scenario: usePlaceBet calls contract directly
- **WHEN** user taps a grid cell during active session
- **THEN** `writeContract` is called with TapBetManager address, placeBet function, and computed args — no axios/fetch involved

#### Scenario: USDC allowance checked before first bet
- **WHEN** user's USDC allowance for TapBetManager is 0
- **THEN** hook submits approve(TapBetManager, maxUint256) transaction first, then places bet after confirmation

#### Scenario: Subsequent bets skip approval
- **WHEN** allowance is already > 0
- **THEN** bet is placed directly without an approval transaction

### Requirement: useOneTapProfitBetting.ts is deleted along with all relay/session-key dependencies
`useOneTapProfitBetting.ts` MUST be deleted. `useSessionKey.ts`, `usePaymaster.ts`, and `relayApi.ts` MUST be deleted. Any import referencing these files MUST be removed or replaced.

#### Scenario: No session key imports in frontend
- **WHEN** TypeScript compilation runs (`tsc --noEmit`)
- **THEN** no import of `useSessionKey`, `usePaymaster`, or `relayApi` exists in the codebase

### Requirement: USDC approval targets TapBetManager, not StabilityFund
All USDC approval calls in the frontend MUST reference `TapBetManager` address. No reference to `STABILITY_FUND_ADDRESS` SHALL remain in bet-related code.

#### Scenario: Approval sent to TapBetManager
- **WHEN** user approves USDC for the first time
- **THEN** the `approve()` call uses the TapBetManager contract address as spender
