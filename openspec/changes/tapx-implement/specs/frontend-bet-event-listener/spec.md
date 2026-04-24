## ADDED Requirements

### Requirement: useBetEvents.ts subscribes to BetWon and BetExpired events via useWatchContractEvent
`Tethra-Front-End/src/features/trading/hooks/useBetEvents.ts` MUST be created using Wagmi's `useWatchContractEvent`. On `BetWon` event for the connected user's betId: trigger green win animation on the cell and show a `sonner` toast "+{payout} USDC". On `BetExpired` event: dim the cell and show "-{collateral} USDC" in bet history.

#### Scenario: BetWon event received for current user
- **WHEN** BetWon event arrives for a betId belonging to the connected wallet
- **THEN** corresponding grid cell shows green win animation and sonner toast shows payout amount

#### Scenario: BetWon event for another user ignored
- **WHEN** BetWon event arrives for a different user's betId
- **THEN** no visual change occurs in current user's grid

#### Scenario: BetExpired event received for current user
- **WHEN** BetExpired event arrives for a betId belonging to the connected wallet
- **THEN** grid cell dims and bet history shows "-{collateral} USDC"

### Requirement: Active bets are tracked locally from BetPlaced event and tx receipt
When a `placeBet` transaction confirms, the frontend MUST extract the `betId` from the `BetPlaced` event log and add it to local active bets state. This enables countdown display without requiring a separate chain read.

#### Scenario: Bet added to local state on confirmation
- **WHEN** placeBet transaction confirms and BetPlaced event is parsed
- **THEN** betId and cell coordinates are stored locally, enabling countdown timer

#### Scenario: Failed transaction does not add bet
- **WHEN** placeBet reverts
- **THEN** no betId added to local state; optional error toast displayed

### Requirement: Bet polling fallback via getUserBets for reliability on public RPC
As a fallback, `useBetEvents.ts` MUST also poll `TapBetManager.getUserBets(address)` every 5 seconds to sync bet statuses. This handles RPC nodes that drop event subscriptions.

#### Scenario: Polling catches bet settled while event was missed
- **WHEN** BetWon event was dropped by RPC but polling detects WON status
- **THEN** frontend updates cell state correctly
