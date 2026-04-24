## ADDED Requirements

### Requirement: PriceAdapter.sol is a new file in tethra-sc/src/trading/
`PriceAdapter.sol` MUST be created at `tethra-sc/src/trading/PriceAdapter.sol`. It SHALL wrap the Pyth `IPyth` interface. It MUST implement `verifyAndGetPrice(bytes[] calldata priceUpdateData, bytes32 priceId) external payable returns (uint256 price, uint256 publishTime)` which calls Pyth's `updatePriceFeeds` and `getPriceNoOlderThan`, enforces `maxPriceAge` (30s) and `maxConfidenceBps` (100 = 1%), and returns the verified price in 8 decimals.

#### Scenario: Valid proof accepted and price returned
- **WHEN** proof is < 30s old and confidence < 1% of price
- **THEN** verified price and publishTime returned

#### Scenario: Stale proof rejected
- **WHEN** proof publishTime is > 30s before block.timestamp
- **THEN** transaction reverts

#### Scenario: Wide confidence interval rejected
- **WHEN** confidence interval > maxConfidenceBps
- **THEN** transaction reverts

### Requirement: setPriceId maps internal symbol to Pyth feed ID
`setPriceId(bytes32 symbol, bytes32 pythPriceId) external onlyOwner` MUST register the mapping. BTC, ETH Pyth feed IDs MUST be set in the deploy script post-deployment.

#### Scenario: BTC price feed registered
- **WHEN** owner calls `setPriceId(keccak256("BTC"), BTC_USD_PYTH_ID)`
- **THEN** `verifyAndGetPrice` calls use the correct feed ID for BTC bets

#### Scenario: Non-owner setPriceId reverts
- **WHEN** non-owner calls `setPriceId`
- **THEN** transaction reverts

### Requirement: MockPyth in tethra-sc/test/mocks/ replaces old mock for all tests
`tethra-sc/test/mocks/MockPyth.sol` MUST exist and implement the Pyth `IPyth` interface with deterministic price proofs controlled by test setup. It MUST allow tests to set the returned price, publishTime, and confidence.

#### Scenario: MockPyth returns configured price in tests
- **WHEN** test sets MockPyth price to $69,360 with fresh timestamp
- **THEN** `PriceAdapter.verifyAndGetPrice` returns $69,360 in tests
