## ADDED Requirements

### Requirement: VaultPool.sol renamed and simplified to TapVault.sol
`tethra-sc/src/treasury/VaultPool.sol` MUST be replaced with `TapVault.sol`. The LP share deposit/withdraw mechanics SHALL be retained. The following VaultPool features MUST be removed: `virtualSupply`, `lockPeriod`, `earlyExitFeeBps`, `streamToVault()`, `receiveFromSettlement()`, `apyEstimateBps`, `totalYieldAccrued`. The `SETTLER_ROLE` pattern MUST be replaced with a single `betManager` address set via `setBetManager(address)`.

#### Scenario: VaultPool features removed during rewrite
- **WHEN** `forge build` compiles TapVault.sol
- **THEN** no reference to `virtualSupply`, `lockPeriod`, `streamToVault`, or `apyEstimateBps` exists

### Requirement: collectCollateral() and payout() are restricted to betManager only
`collectCollateral(uint256 amount)` MUST transfer `amount` USDC from the calling context into the vault (caller is TapBetManager, which holds user's pre-approved USDC). `payout(address to, uint256 amount)` MUST transfer USDC from vault to `to`. Both MUST revert if `msg.sender != betManager`. `payout` MUST revert if vault balance < amount.

#### Scenario: BetManager calls collectCollateral
- **WHEN** TapBetManager calls `collectCollateral(10e6)` after user approves TapBetManager
- **THEN** 10 USDC moves from user to TapVault

#### Scenario: payout reverts on insufficient liquidity
- **WHEN** vault has 50 USDC and payout is called for 80 USDC
- **THEN** transaction reverts — no partial payment

#### Scenario: Non-betManager call to collectCollateral reverts
- **WHEN** arbitrary address calls `collectCollateral`
- **THEN** transaction reverts

### Requirement: LP deposit/withdraw with share proportional accounting is retained
`deposit(uint256 amount)` SHALL mint vault shares proportional to the depositor's contribution. `withdraw(uint256 shares)` SHALL burn shares and return proportional USDC. Share value SHALL increase as losing bet collateral accumulates in the vault.

#### Scenario: LP deposits and receives shares
- **WHEN** LP deposits 1000 USDC into empty vault
- **THEN** LP receives shares, LPDeposited event emitted

#### Scenario: LP withdraws shares for USDC
- **WHEN** LP calls withdraw with valid share amount
- **THEN** USDC returned proportionally, shares burned, LPWithdrawn event emitted

### Requirement: setBetManager() is owner-callable and sets the authorized betManager address
`setBetManager(address _betManager)` SHALL only be callable by the contract owner. It MUST be called post-deploy before any bets can be placed.

#### Scenario: Owner sets betManager post-deploy
- **WHEN** owner calls `setBetManager(TapBetManagerAddress)` after deployment
- **THEN** `betManager` is set and subsequent `collectCollateral`/`payout` calls from TapBetManager succeed
