# Smart Contract Specs — TapX on Monad

> All contracts written in Solidity ^0.8.24, compiled and tested with Foundry.
> Deployed on Monad Testnet (chainId: 10143).

---

## Contract Overview

```
contracts/src/
├── TapBetManager.sol      # Core: bet placement and settlement
├── TapVault.sol           # Liquidity pool: holds collateral, funds payouts
├── MultiplierEngine.sol   # Multiplier table per (priceDistance, timeBucket)
├── PriceAdapter.sol       # Pyth oracle wrapper
└── interfaces/
    ├── ITapBetManager.sol
    ├── ITapVault.sol
    └── IPyth.sol          # From Pyth SDK
```

---

## 1. TapBetManager.sol

**Purpose:** The heart of TapX. Handles all bet placement, win settlement, and expiry. Interacts with TapVault for fund movement and PriceAdapter for price verification.

### Structs & Enums

```solidity
enum BetStatus {
    ACTIVE,
    WON,
    EXPIRED
}

enum Direction {
    UP,    // target price is above current price at bet time
    DOWN   // target price is below current price at bet time
}

struct Bet {
    uint256 betId;
    address user;
    bytes32 symbol;          // e.g. keccak256("BTC")
    uint256 targetPrice;     // 8 decimals (Pyth format)
    uint256 collateral;      // USDC, 6 decimals
    uint256 multiplier;      // basis 100 (e.g. 800 = 8x)
    Direction direction;     // UP or DOWN — derived at placement from targetPrice vs currentPrice
    uint256 expiry;          // Unix timestamp
    BetStatus status;
    uint256 placedAt;
}
```

### Storage

```solidity
mapping(uint256 => Bet) public bets;              // betId → Bet
mapping(address => uint256[]) public userBets;    // user → betIds
uint256[] public activeBetIds;                    // for solver iteration
uint256 public nextBetId;

address public vault;          // TapVault address
address public priceAdapter;   // PriceAdapter address
address public multiplierEngine;
```

### Functions

```solidity
// Place a bet. User must have pre-approved USDC spending.
// targetPrice: the absolute price level of the tapped cell (8 decimals)
// expiry: timestamp of the cell's time bucket end
// expectedMultiplier: the multiplier shown to the user in the UI (contract validates it matches engine)
//
// Direction is derived automatically:
//   targetPrice > currentPrice → Direction.UP
//   targetPrice < currentPrice → Direction.DOWN
//
// Emits: BetPlaced(betId, user, symbol, targetPrice, collateral, multiplier, direction, expiry)
function placeBet(
    bytes32 symbol,
    uint256 targetPrice,
    uint256 expiry,
    uint256 expectedMultiplier
) external returns (uint256 betId);

// Called by solver when price touches the target level.
// priceUpdateData: signed bytes from Pyth Hermes API — verified on-chain.
// Pays out immediately to bet.user. Solver receives settlement fee.
//
// Emits: BetWon(betId, user, payout, settlerFee, settlementPrice)
function settleBetWin(
    uint256 betId,
    bytes[] calldata priceUpdateData
) external;

// Called by anyone after expiry if bet was never settled.
// Collateral stays in vault. Caller receives small gas rebate.
//
// Emits: BetExpired(betId, user, collateral)
function settleExpired(uint256 betId) external;

// Batch version of settleExpired for gas efficiency
function batchSettleExpired(uint256[] calldata betIds) external;

// View
function getBet(uint256 betId) external view returns (Bet memory);
function getActiveBets() external view returns (uint256[] memory);
function getUserBets(address user) external view returns (uint256[] memory);
```

### Win Validation Logic

```
function _validateWin(Bet memory bet, uint256 currentPrice) internal pure {
    if (bet.direction == Direction.UP) {
        require(currentPrice >= bet.targetPrice, "Price not reached");
    } else {
        require(currentPrice <= bet.targetPrice, "Price not reached");
    }
    require(block.timestamp <= bet.expiry, "Bet already expired");
    require(bet.status == BetStatus.ACTIVE, "Bet not active");
}
```

### Payout Calculation

```
payout       = bet.collateral * bet.multiplier / 100
settlerFee   = payout * SETTLER_FEE_BPS / 10000   // e.g. 50 bps = 0.5%
userPayout   = payout - settlerFee
```

`SETTLER_FEE_BPS` is a protocol constant (configurable by owner). Default: 50 bps.

### Events

```solidity
event BetPlaced(
    uint256 indexed betId,
    address indexed user,
    bytes32 indexed symbol,
    uint256 targetPrice,
    uint256 collateral,
    uint256 multiplier,
    Direction direction,
    uint256 expiry
);

event BetWon(
    uint256 indexed betId,
    address indexed user,
    uint256 payout,
    uint256 settlerFee,
    uint256 settlementPrice
);

event BetExpired(
    uint256 indexed betId,
    address indexed user,
    uint256 collateral
);
```

---

## 2. TapVault.sol

**Purpose:** The liquidity pool. Holds all collateral from active and lost bets. Funds winning payouts. Can accept deposits from external Liquidity Providers (LPs) who earn yield from the house edge.

### Structs

```solidity
struct LPPosition {
    uint256 deposited;     // USDC deposited by LP
    uint256 shares;        // vault shares (proportional claim on vault)
}
```

### Storage

```solidity
IERC20 public usdc;
mapping(address => LPPosition) public lpPositions;
uint256 public totalShares;
uint256 public totalDeposited;
address public betManager;    // only BetManager can call payout/collect
```

### Functions

```solidity
// LP deposits USDC to provide liquidity. Receives shares proportional to vault size.
// Emits: LPDeposited(lp, amount, shares)
function deposit(uint256 amount) external;

// LP withdraws USDC based on their share proportion.
// Emits: LPWithdrawn(lp, amount, shares)
function withdraw(uint256 shares) external;

// Called by BetManager when a bet is placed — collateral enters vault.
function collectCollateral(uint256 amount) external onlyBetManager;

// Called by BetManager when a bet wins — vault pays out to user.
// Reverts if vault has insufficient liquidity.
function payout(address to, uint256 amount) external onlyBetManager;

// View
function getVaultBalance() external view returns (uint256);
function getShareValue() external view returns (uint256);   // USDC per share
function getLPPosition(address lp) external view returns (LPPosition memory);
function canCoverPayout(uint256 amount) external view returns (bool);
```

### Events

```solidity
event LPDeposited(address indexed lp, uint256 amount, uint256 shares);
event LPWithdrawn(address indexed lp, uint256 amount, uint256 shares);
event PayoutIssued(address indexed to, uint256 amount);
event CollateralCollected(uint256 amount);
```

---

## 3. MultiplierEngine.sol

**Purpose:** The single source of truth for multipliers. Both the contract and frontend read from (or replicate) this engine to display consistent multipliers. Prevents users from submitting manipulated multiplier values.

### Grid Dimensions

**Price distance bands** (percentage from current price at bet time):

```solidity
uint8 constant BAND_0_5  = 0;   // 0% – 0.5%
uint8 constant BAND_1    = 1;   // 0.5% – 1%
uint8 constant BAND_2    = 2;   // 1% – 2%
uint8 constant BAND_5    = 3;   // 2% – 5%
uint8 constant BAND_10   = 4;   // 5% – 10%
uint8 constant BAND_OVER = 5;   // > 10%
```

**Time buckets:**

```solidity
uint8 constant TIME_1M   = 0;   // 1 minute
uint8 constant TIME_5M   = 1;   // 5 minutes
uint8 constant TIME_15M  = 2;   // 15 minutes
uint8 constant TIME_30M  = 3;   // 30 minutes
uint8 constant TIME_1H   = 4;   // 1 hour
```

### Multiplier Table (basis 100 = 1x)

```solidity
// multiplierTable[priceBand][timeBucket] = multiplier (basis 100)
uint256[6][5] public multiplierTable = [
//  1min   5min  15min  30min   1hr
    [150,   120,   110,   105,   102],   // 0–0.5%
    [600,   400,   250,   180,   130],   // 0.5–1%
    [1500,  800,   500,   300,   200],   // 1–2%
    [5000,  2500,  1200,  600,   350],   // 2–5%
    [20000, 8000,  3000,  1500,  700],   // 5–10%
    [50000, 20000, 8000,  3000,  1500],  // >10%
];
```

### Functions

```solidity
// Compute multiplier (basis 100) for a given price distance and time to expiry.
// currentPrice and targetPrice in 8 decimals.
// timeToExpiry in seconds.
// Returns: multiplier in basis 100 (e.g. 800 = 8x)
function getMultiplier(
    uint256 currentPrice,
    uint256 targetPrice,
    uint256 timeToExpiry
) external view returns (uint256 multiplier);

// Internal helpers
function _getPriceBand(uint256 distanceBps) internal pure returns (uint8);
function _getTimeBucket(uint256 timeToExpiry) internal pure returns (uint8);

// Owner: update multiplier table (governance / rebalancing)
function setMultiplier(uint8 priceBand, uint8 timeBucket, uint256 multiplier) external onlyOwner;
```

### Tolerance on Frontend-Submitted Multiplier

When a user places a bet, they submit `expectedMultiplier` (what they saw on screen). The contract validates:

```solidity
uint256 engineMultiplier = MultiplierEngine.getMultiplier(currentPrice, targetPrice, timeToExpiry);
require(
    expectedMultiplier >= engineMultiplier * 99 / 100 &&
    expectedMultiplier <= engineMultiplier * 101 / 100,
    "Multiplier mismatch"
);
```

A 1% tolerance handles minor price movement between when the user saw the UI and when the tx is mined.

---

## 4. PriceAdapter.sol

**Purpose:** Wraps Pyth's `IPyth` interface. Called at settlement time to verify that price actually reached the target level.

### Functions

```solidity
// Verify a Pyth price update proof and return the confirmed price.
// Reverts if proof is invalid, too old, or confidence interval is too wide.
// payable because Pyth charges a small fee for price updates.
function verifyAndGetPrice(
    bytes[] calldata priceUpdateData,
    bytes32 priceId
) external payable returns (uint256 price, uint256 publishTime);

// Get cached latest price (for display only — not for settlement)
function getLatestPrice(bytes32 priceId) external view returns (uint256 price, uint256 publishTime);

// Owner: register symbol → Pyth price feed ID mapping
function setPriceId(bytes32 symbol, bytes32 pythPriceId) external onlyOwner;
```

### Price Feed IDs

```solidity
bytes32 BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
bytes32 ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
// MON_USD: check Pyth explorer for Monad testnet ID
```

### Validation Config

```solidity
uint256 public maxPriceAge = 30;        // seconds — reject prices older than 30s
uint256 public maxConfidenceBps = 100;  // reject if confidence > 1% of price
```

---

## Access Control Summary

| Function | Who can call |
|---|---|
| `placeBet()` | Any user |
| `settleBetWin()` | Any registered settler (solver) |
| `settleExpired()` / `batchSettleExpired()` | Anyone |
| `collectCollateral()` | TapBetManager only |
| `payout()` | TapBetManager only |
| `deposit()` / `withdraw()` | Any LP |
| `setMultiplier()` | Owner |
| `setPriceId()` | Owner |

---

## Deployment Order

```
1. PriceAdapter.sol       (depends on: Pyth contract address)
2. MultiplierEngine.sol   (standalone)
3. TapVault.sol           (depends on: USDC address)
4. TapBetManager.sol      (depends on: TapVault, PriceAdapter, MultiplierEngine)

Post-deploy:
  TapVault.setBetManager(address(TapBetManager))
  PriceAdapter.setPriceId(keccak256("BTC"), BTC_USD_PYTH_ID)
  PriceAdapter.setPriceId(keccak256("ETH"), ETH_USD_PYTH_ID)
  PriceAdapter.setPriceId(keccak256("MON"), MON_USD_PYTH_ID)

Optional:
  TapVault.deposit(initialLiquidity)   // seed vault with initial LP funds
```

---

## State Machine: Bet Lifecycle

```
placeBet()
    │
    ▼
┌────────┐
│ ACTIVE │
└───┬────┘
    │
    ├──── price touches target (before expiry)
    │         settleBetWin() called by solver
    │                 │
    │                 ▼
    │           ┌─────────┐
    │           │   WON   │  → user receives collateral × multiplier
    │           └─────────┘
    │
    └──── expiry timestamp passes (price never touched target)
              settleExpired() called by anyone
                      │
                      ▼
                ┌─────────┐
                │ EXPIRED │  → collateral stays in vault
                └─────────┘
```

---

## Testing Strategy

```
test/
├── TapBetManager.t.sol     # placeBet, settleBetWin (UP/DOWN), settleExpired, multiplier validation
├── TapVault.t.sol          # LP deposit/withdraw, payout, collectCollateral, liquidity edge cases
├── MultiplierEngine.t.sol  # getMultiplier for all bands and time buckets
├── PriceAdapter.t.sol      # price verification, staleness, confidence checks
├── Integration.t.sol       # full flow: place → price moves → solver settles → payout
└── mocks/
    ├── MockPyth.sol         # deterministic price proofs for testing
    └── MockUSDC.sol         # ERC20 mock
```

### Critical Edge Cases to Test

- Bet placed exactly at multiplier boundary (1% vs 2% price distance)
- Bet settled at exact expiry timestamp (boundary condition)
- Multiple bets on same symbol win simultaneously (vault liquidity)
- settleBetWin called after expiry → should revert
- settleExpired called before expiry → should revert
- Vault has insufficient liquidity for payout → should revert (not partial pay)
- expectedMultiplier just outside 1% tolerance → should revert
