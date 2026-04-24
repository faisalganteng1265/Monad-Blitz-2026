# User & System Flows — TapX on Monad

---

## 1. User Flow: Setup Trading Session

Before tapping anything, the user configures their session once.

```
User opens TapX
    │
    ▼
Connect wallet (Privy — social login or embedded wallet)
    │
    ▼
Select asset: BTC / ETH / MON
    │
    ▼
Set collateral per tap: [ 5 USDC ] [ 10 USDC ] [ 50 USDC ] [ custom ]
    │
    ▼
If first time: Approve USDC (infinite approval, one-time only)
    │
    ▼
Click [Start Trading]
    │
    ▼
Grid becomes interactive — every tap now costs the fixed collateral
```

**Session is frontend state only.** There is no `startSession()` on-chain — it is a UX guard that prevents accidental taps when not in trading mode. The on-chain action happens only on each tap.

---

## 2. User Flow: Place a Bet (Tap)

```
┌─────────────────────────────────────────────────────────────────┐
│  Session is ACTIVE. Grid is live.                               │
│                                                                  │
│  Price ↑   │  1 min  │  5 min  │  15 min │                     │
│  ──────────┼─────────┼─────────┼─────────┤                     │
│  +2%       │  15x    │   8x    │   5x    │                     │
│  ──────────┼─────────┼─────────┼─────────┤                     │
│   CURRENT  │ ← BTC $68,000 (live) ───── │                     │
│  ──────────┼─────────┼─────────┼─────────┤                     │
│  -2%       │  15x    │   8x    │   5x    │                     │
│                                                                  │
│  User taps: (+2%, 5min) → the 8x cell                          │
└─────────────────────────────────────────────────────────────────┘
    │
    │  No modal. No confirmation. Tap = bet.
    │
    ▼
Frontend reads current Pyth price: $68,000
Frontend computes:
    targetPrice = $68,000 × 1.02 = $69,360
    expiry      = now + 5 minutes
    multiplier  = 8x (from MultiplierEngine logic)
    direction   = UP (targetPrice > currentPrice)
    │
    ▼
Frontend calls TapBetManager.placeBet(
    symbol:              keccak256("BTC"),
    targetPrice:         $69,360 (8 decimals),
    expiry:              block.timestamp + 300,
    expectedMultiplier:  800   ← (8x in basis 100)
)
    │
    ▼
Contract executes:
    1. Validates expectedMultiplier ≈ MultiplierEngine.getMultiplier() (±1% tolerance)
    2. Derives direction: targetPrice > currentPrice → Direction.UP
    3. Transfers 10 USDC from user → TapVault
    4. Creates Bet{status: ACTIVE}
    5. Emits BetPlaced event
    │
    ▼
Monad confirms in ~1 second
    │
    ▼
Frontend catches BetPlaced event
Grid cell (+2%, 5min) highlights as ACTIVE with countdown timer
```

---

## 3. System Flow: Win Settlement (Solver)

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLVER SERVICE                                                  │
│                                                                  │
│  Active bets map:                                               │
│  { betId: 42, symbol: BTC, target: $69,360, expiry: T+5min,   │
│    direction: UP }                                              │
│                                                                  │
│  Pyth price stream: BTC = $68,100... $68,400... $68,900...     │
│                              $69,050... $69,200... $69,380...  │
│                                                                  │
│  Solver detects: $69,380 >= $69,360 ← TARGET REACHED           │
│  block.timestamp < expiry ✓                                     │
│       │                                                          │
│       ▼                                                          │
│  Fetch Pyth signed price proof from Hermes API                 │
│  GET /v2/updates/price/latest?ids=BTC_USD_PRICE_ID             │
│  → priceUpdateData (bytes[])                                    │
│       │                                                          │
└───────┼─────────────────────────────────────────────────────────┘
        │ TapBetManager.settleBetWin(betId=42, priceUpdateData)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  MONAD BLOCKCHAIN                                               │
│                                                                  │
│  TapBetManager.settleBetWin():                                  │
│    1. PriceAdapter.verifyAndGetPrice(priceUpdateData, BTC_ID)   │
│       → confirmed price: $69,380, publishTime: T+4m32s          │
│    2. Validate: $69,380 >= $69,360 ✓                            │
│    3. Validate: publishTime < expiry ✓                          │
│    4. Validate: bet.status == ACTIVE ✓                          │
│    5. Compute payout:                                           │
│       payout     = 10 USDC × 8x = 80 USDC                      │
│       settlerFee = 80 × 0.5% = 0.40 USDC                       │
│       userPayout = 79.60 USDC                                   │
│    6. TapVault.payout(user, 79.60 USDC)                        │
│    7. TapVault.payout(solver, 0.40 USDC)                       │
│    8. Bet status → WON                                          │
│    9. Emit BetWon(betId=42, user, payout=79.60, ...)           │
│                                                                  │
│  ← Confirmed in ~1 second →                                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ BetWon event
                       ▼
Frontend catches BetWon event
Grid cell pulses green → WIN animation
"+79.60 USDC" notification appears
USDC balance in wallet increases instantly
```

---

## 4. System Flow: Loss / Expiry

```
block.timestamp > expiry (T+5min passed)
BTC price never reached $69,360 during the window
    │
    ▼
Solver (or anyone) calls:
TapBetManager.settleExpired(betId=42)
    │
    ▼
Contract validates:
    block.timestamp > bet.expiry ✓
    bet.status == ACTIVE ✓
    │
    ▼
No fund movement (10 USDC already in TapVault from placement)
Bet status → EXPIRED
BetExpired event emitted
    │
    ▼
Frontend catches BetExpired event
Grid cell dims → EXPIRED animation
"-10 USDC" shown in bet history
```

---

## 5. Flow: Multiple Simultaneous Bets

```
User taps 5 cells in quick succession (session is active):
    Tap 1: BTC +2%, 5min → 8x   → betId: 42
    Tap 2: BTC -1%, 1min → 6x   → betId: 43
    Tap 3: BTC +5%, 15min → 12x → betId: 44
    Tap 4: ETH +2%, 5min → 8x   → betId: 45
    Tap 5: BTC +1%, 30min → 1.8x→ betId: 46

All 5 bets are ACTIVE simultaneously.
Total exposure: 50 USDC collateral locked in TapVault.

Solver monitors all 5 independently.

BTC drops to -1% → betId 43 (DOWN) wins → settled immediately
BTC stays flat → betIds 42, 44, 46 expire one by one
ETH surges +2% → betId 45 wins → settled immediately
```

**Key design:** Each bet is fully independent. Winning one does not affect others. Multiple wins can settle in the same block (Monad parallel execution).

---

## 6. Flow: End Trading Session

```
User clicks [Stop Trading]
    │
    ▼
Grid becomes non-interactive (no new taps accepted in UI)
    │
    ▼
Existing ACTIVE bets continue running on-chain
(session end is UI-only — it does not cancel on-chain bets)
    │
    ▼
User can observe remaining active bets until they WIN or EXPIRE
```

---

## 7. State Machine: Bet Lifecycle

```
User taps grid cell
    │
    │  placeBet()
    ▼
┌────────┐
│ ACTIVE │ ← collateral in TapVault
└───┬────┘
    │
    ├──── price touches targetPrice before expiry
    │          solver calls settleBetWin()
    │                  │
    │                  ▼
    │           ┌──────────┐
    │           │   WON    │ → user receives payout instantly
    │           └──────────┘
    │
    └──── expiry passes, price never touched target
               anyone calls settleExpired()
                       │
                       ▼
                 ┌─────────┐
                 │ EXPIRED │ → collateral remains in vault
                 └─────────┘
```

**There is no CANCELLED state.** Once tapped, a bet runs to completion — either WON or EXPIRED.

---

## 8. Price & Multiplier Flow

```
HOW THE GRID IS RENDERED
─────────────────────────
Pyth Hermes WebSocket → current BTC price: $68,000
    │
    ▼
Frontend computes grid cells:
    For each (priceBand, timeBucket) combination:
        absolutePrice = currentPrice × (1 ± priceBand%)
        multiplier    = MultiplierEngine.getMultiplier(currentPrice, absolutePrice, timeBucket)

Grid re-renders on every Pyth price update (~400ms)
Price bands stay anchored to CURRENT price, not historical


HOW MULTIPLIER IS VALIDATED AT BET TIME
─────────────────────────────────────────
Frontend sends: expectedMultiplier = 800 (8x)
Contract computes: engineMultiplier = MultiplierEngine.getMultiplier(...)
Contract checks: |expectedMultiplier - engineMultiplier| ≤ 1%
    → If price moved between UI render and tx mine, a small drift is tolerated
    → If drift > 1% (user manipulated or extreme volatility): revert


HOW PRICE IS VERIFIED AT SETTLEMENT
─────────────────────────────────────
Solver submits: priceUpdateData (Pyth signed bytes)
PriceAdapter.verifyAndGetPrice() on Monad:
    → Calls Pyth contract to verify cryptographic signature
    → Checks: publishTime is recent (< 30 seconds old)
    → Checks: confidence interval is tight (< 1% of price)
    → Returns: verified price + publishTime
Contract uses ONLY this verified price for settlement decision
```

---

## 9. Before vs After: Concept Comparison

### Tethra (Chainlink/Base) — Tap to Trade

```
Concept: Fast limit order placement
Order stored: Backend RAM (off-chain)
Execution: Backend executes when trigger price hit
Result: Perpetual position opened (ongoing risk)
Win/Loss: PnL from position management (complex)
User experience: Setup → tap → manage position
```

### TapX (Monad) — Tap to Trade

```
Concept: Price prediction game (binary outcome)
Order stored: On-chain (TapBetManager.sol)
Execution: Solver settles when price touches target
Result: Instant payout OR collateral lost (no ongoing position)
Win/Loss: Fixed multiplier (known upfront at tap time)
User experience: Setup once → tap → win or lose instantly
```

**Fundamental shift:** TapX has no "position management" phase. Every bet resolves completely — win is a payout, loss is collateral gone. The user always knows their maximum loss (collateral per tap) and maximum win (collateral × multiplier) before tapping.
