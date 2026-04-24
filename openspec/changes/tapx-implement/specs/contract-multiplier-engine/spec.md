## ADDED Requirements

### Requirement: MultiplierEngine.sol is a new file in tethra-sc/src/trading/
`MultiplierEngine.sol` MUST be created at `tethra-sc/src/trading/MultiplierEngine.sol`. It SHALL contain a 6×5 `multiplierTable[6][5]` (price bands × time buckets) with exact values from the tapx-docs spec. It SHALL implement `getMultiplier(uint256 currentPrice, uint256 targetPrice, uint256 timeToExpiry) external view returns (uint256)` returning basis-100 multiplier.

#### Scenario: 2% distance, 5-minute bucket returns 800
- **WHEN** `getMultiplier` called with ~2% price distance and ~300s timeToExpiry
- **THEN** returns 800 (8x)

#### Scenario: >10% distance, 1-minute bucket returns 50000
- **WHEN** price distance is >10% and timeToExpiry < 60s
- **THEN** returns 50000 (500x)

#### Scenario: Multiplier is symmetric for UP and DOWN
- **WHEN** targetPrice is 2% above OR 2% below currentPrice with same timeToExpiry
- **THEN** `getMultiplier` returns the same value in both cases

### Requirement: setMultiplier() allows owner to update table entries
`setMultiplier(uint8 priceBand, uint8 timeBucket, uint256 multiplier) external onlyOwner` MUST update `multiplierTable[priceBand][timeBucket]`. Non-owner calls MUST revert.

#### Scenario: Owner updates a table entry
- **WHEN** owner calls `setMultiplier(2, 1, 900)` (BAND_2, TIME_5M → 9x)
- **THEN** `getMultiplier` for 1-2% distance + 5min returns 900

#### Scenario: Non-owner setMultiplier reverts
- **WHEN** non-owner calls `setMultiplier`
- **THEN** transaction reverts

### Requirement: TypeScript multiplierEngine.ts mirrors the Solidity table exactly
A file `Tethra-Front-End/src/features/trading/lib/multiplierEngine.ts` MUST export `getMultiplier(currentPrice: bigint, targetPrice: bigint, timeToExpiry: number): number` implementing the exact same band boundaries and table lookup as the Solidity contract.

#### Scenario: TypeScript result matches on-chain result for all 30 cells
- **WHEN** both TypeScript and Solidity getMultiplier are called with the same inputs
- **THEN** they return identical values for every combination of the 6×5 grid
