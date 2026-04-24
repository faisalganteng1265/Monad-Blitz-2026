## ADDED Requirements

### Requirement: WinDetector replaces hasPriceCrossedTarget logic with direction-based trigger
`tethra-be/src/services/WinDetector.ts` MUST iterate `activeBets` on each price update for the matching symbol. Win condition: `(direction === 'UP' && currentPrice >= targetPrice) || (direction === 'DOWN' && currentPrice <= targetPrice)` AND `Date.now()/1000 < expiry`. Triggered betIds MUST be added to a `settleQueue: Set<bigint>` for deduplication.

#### Scenario: UP bet triggered when price crosses target
- **WHEN** price update for BTC arrives with price >= bet's targetPrice before expiry
- **THEN** betId is added to settleQueue exactly once

#### Scenario: Expired bet not added to win queue
- **WHEN** price satisfies win condition but bet is past expiry
- **THEN** betId is NOT added to settleQueue

#### Scenario: Same bet triggered twice by consecutive price updates
- **WHEN** two consecutive price updates both exceed the same target
- **THEN** settleQueue contains betId only once (Set deduplication)

### Requirement: Settler fetches Pyth Hermes proof and submits settleBetWin via Viem wallet client
`tethra-be/src/services/Settler.ts` MUST use `@pythnetwork/hermes-client` or fetch from `https://hermes.pyth.network/v2/updates/price/latest` to get `priceUpdateData`. It MUST use Viem's `walletClient.writeContract` (not ethers) to call `TapBetManager.settleBetWin(betId, priceUpdateData)` using `PRIVATE_KEY` from env.

#### Scenario: Settler fetches proof and submits transaction
- **WHEN** betId is dequeued from settleQueue
- **THEN** Settler fetches Hermes proof for the bet's symbol and calls settleBetWin on Monad testnet

#### Scenario: Pre-simulation skips already-settled bet
- **WHEN** Settler pre-simulates via eth_call and detects bet is no longer ACTIVE
- **THEN** submission is skipped; no gas wasted

#### Scenario: Stale proof triggers retry
- **WHEN** transaction reverts due to proof age
- **THEN** Settler re-fetches proof and retries once

### Requirement: Settler uses viem walletClient, NOT ethers.Wallet
The ethers dependency MUST be removed from `tethra-be/package.json`. All on-chain writes in the solver MUST use `viem`'s `createWalletClient` with `privateKeyToAccount`.

#### Scenario: Solver starts without ethers installed
- **WHEN** `npm install` runs in tethra-be without ethers
- **THEN** all solver services compile and run without import errors
