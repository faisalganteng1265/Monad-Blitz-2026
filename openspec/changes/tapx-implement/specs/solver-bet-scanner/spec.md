## ADDED Requirements

### Requirement: BetScanner replaces OneTapProfitMonitor startup sync using Viem (not ethers)
`tethra-be/src/services/BetScanner.ts` MUST be created. On startup it SHALL call `TapBetManager.getActiveBets()` via Viem `readContract`, fetch each Bet struct, and populate `activeBets: Map<bigint, ActiveBet>`. It MUST use `viem`'s `publicClient`, NOT `ethers.JsonRpcProvider`.

#### Scenario: Startup sync loads all active bets from chain
- **WHEN** BetScanner.start() is called and there are 50 ACTIVE bets on-chain
- **THEN** activeBets map contains all 50 bets before price watching begins

#### Scenario: Empty chain starts cleanly
- **WHEN** no bets exist on-chain
- **THEN** BetScanner starts with empty map and no error

### Requirement: BetScanner subscribes to BetPlaced events and adds new bets in real-time
BetScanner MUST call Viem `watchContractEvent` for the `BetPlaced` event on TapBetManager. On each event, the new bet SHALL be added to the `activeBets` map.

#### Scenario: BetPlaced event adds bet to map
- **WHEN** a BetPlaced event is received
- **THEN** new bet is added to activeBets map with correct targetPrice, expiry, and direction

### Requirement: BetScanner removes bets on BetWon and BetExpired events
BetScanner MUST watch `BetWon` and `BetExpired` events. On each event, the corresponding betId SHALL be removed from `activeBets`.

#### Scenario: BetWon event removes bet from map
- **WHEN** a BetWon event is received for betId X
- **THEN** betId X is no longer in activeBets map

#### Scenario: BetExpired event removes bet from map
- **WHEN** a BetExpired event is received for betId X
- **THEN** betId X is no longer in activeBets map
