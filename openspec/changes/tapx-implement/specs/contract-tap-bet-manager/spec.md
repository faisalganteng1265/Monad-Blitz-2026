## ADDED Requirements

### Requirement: Replace OneTapProfit.sol with TapBetManager.sol in tethra-sc/src/trading/
The file `tethra-sc/src/trading/OneTapProfit.sol` MUST be replaced with `TapBetManager.sol`. The new contract SHALL use `bytes32 symbol`, add a `Direction` enum (UP/DOWN), add `activeBetIds[]` array, store `address vault` and `address priceAdapter` and `address multiplierEngine`. All keeper/meta-tx/CRE/private-bet/SETTLER_ROLE-restricted logic MUST be removed.

#### Scenario: Old OneTapProfit.sol removed and TapBetManager.sol created
- **WHEN** the contracts directory is built with `forge build`
- **THEN** no reference to `OneTapProfit`, `placeBetMeta`, `placeBetByKeeper`, `PrivateBet`, `CRE_SETTLER_ROLE` exists in the compiled output

### Requirement: placeBet() is called directly by the user without any relay or keeper
`TapBetManager.placeBet(bytes32 symbol, uint256 targetPrice, uint256 expiry, uint256 expectedMultiplier)` SHALL be callable by any EOA. It MUST validate `expectedMultiplier` within ±1% of `MultiplierEngine.getMultiplier()`, derive `direction` (UP if targetPrice > currentPrice, DOWN otherwise), call `TapVault.collectCollateral(msg.value /* USDC amount */)`, create a `Bet` struct with `status = ACTIVE`, push `betId` to `activeBetIds`, push `betId` to `userBets[msg.sender]`, and emit `BetPlaced`.

#### Scenario: Direct user call places bet successfully
- **WHEN** a user calls `placeBet` with valid symbol, targetPrice, expiry, and expectedMultiplier (with correct USDC pre-approved to TapBetManager)
- **THEN** collateral moves to TapVault, Bet is stored ACTIVE, betId added to activeBetIds, BetPlaced emitted

#### Scenario: placeBet reverts if multiplier deviates more than 1%
- **WHEN** user submits expectedMultiplier that differs from engine output by more than 1%
- **THEN** transaction reverts with "Multiplier mismatch"

#### Scenario: placeBet reverts if USDC not approved
- **WHEN** user has not approved TapBetManager for USDC
- **THEN** transaction reverts due to ERC20 transfer failure

### Requirement: settleBetWin() is permissionless and requires Pyth price proof
`TapBetManager.settleBetWin(uint256 betId, bytes[] calldata priceUpdateData)` SHALL be callable by any address. It MUST call `PriceAdapter.verifyAndGetPrice(priceUpdateData, priceId)` to get verified on-chain price, validate direction win condition, validate `block.timestamp <= bet.expiry`, validate `bet.status == ACTIVE`, compute `payout = collateral × multiplier / 100`, compute `settlerFee = payout × SETTLER_FEE_BPS / 10000`, call vault to pay user `payout - settlerFee` and caller `settlerFee`, update status to WON, remove from `activeBetIds`, emit `BetWon`.

#### Scenario: Solver settles a winning UP bet
- **WHEN** solver calls `settleBetWin` with valid Pyth proof showing price >= targetPrice before expiry
- **THEN** user receives payout minus 0.5% fee, solver receives fee, status becomes WON, BetWon emitted

#### Scenario: settleBetWin reverts if price proof does not confirm target reached
- **WHEN** Pyth proof shows price has not reached the target
- **THEN** transaction reverts with "Price not reached"

#### Scenario: settleBetWin reverts on already-settled bet
- **WHEN** bet status is WON or EXPIRED
- **THEN** transaction reverts with "Bet not active"

### Requirement: settleExpired() and batchSettleExpired() are permissionless
`settleExpired(uint256 betId)` SHALL revert if `block.timestamp <= bet.expiry`. `batchSettleExpired(uint256[] calldata betIds)` SHALL silently skip non-eligible bets. Both MUST update status to EXPIRED, remove from `activeBetIds`, and emit `BetExpired`.

#### Scenario: Expired bet settled by anyone
- **WHEN** anyone calls `settleExpired` after expiry
- **THEN** bet status becomes EXPIRED, BetExpired emitted, collateral stays in vault

#### Scenario: settleExpired before expiry reverts
- **WHEN** `settleExpired` called while bet is not yet expired
- **THEN** transaction reverts

#### Scenario: batchSettleExpired skips unexpired bets
- **WHEN** batch contains 5 betIds, 3 expired and 2 not
- **THEN** only 3 are settled, 2 are silently skipped, no revert

### Requirement: getActiveBets() returns all currently ACTIVE betIds for solver scanning
`getActiveBets() external view returns (uint256[] memory)` SHALL return the `activeBetIds` array. This is the primary mechanism the solver uses on startup to sync active bets.

#### Scenario: getActiveBets returns active bets
- **WHEN** 10 bets are ACTIVE and 3 are WON/EXPIRED
- **THEN** `getActiveBets()` returns exactly 10 betIds
