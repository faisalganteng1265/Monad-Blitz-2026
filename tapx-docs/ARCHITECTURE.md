# Architecture — TapX on Monad

---

## High-Level System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    TapX Frontend                        │   │
│   │                                                          │   │
│   │   [Collateral: 10 USDC] [Asset: BTC] [Start Trading]   │   │
│   │                                                          │   │
│   │   Price Grid (live Pyth prices overlaid)                │   │
│   │   ┌──────┬──────┬──────┬──────┬──────┐                 │   │
│   │   │ 50x  │ 25x  │ 12x  │  6x  │ 3.5x │  ← +5%         │   │
│   │   ├──────┼──────┼──────┼──────┼──────┤                 │   │
│   │   │ 15x  │  8x  │  5x  │  3x  │  2x  │  ← +2%         │   │
│   │   ├──────┼──────┼──────┼──────┼──────┤                 │   │
│   │   │══════════ CURRENT PRICE ══════════│                 │   │
│   │   ├──────┼──────┼──────┼──────┼──────┤                 │   │
│   │   │ 15x  │  8x  │  5x  │  3x  │  2x  │  ← -2%         │   │
│   │   └──────┴──────┴──────┴──────┴──────┘                 │   │
│   │    1min   5min  15min  30min   1hr                      │   │
│   │                                                          │   │
│   └───────────────────┬─────────────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────────────┘
                        │ placeBet() via Wagmi
                        │
┌───────────────────────▼──────────────────────────────────────────┐
│                       MONAD BLOCKCHAIN                           │
│                                                                  │
│   ┌────────────────┐    ┌──────────────────┐    ┌───────────┐  │
│   │ TapBetManager  │───►│   TapVault       │    │PriceAdapt │  │
│   │ (bet placement │    │ (liquidity pool) │    │(Pyth wrap)│  │
│   │  & settlement) │◄───│                  │    │           │  │
│   └────────────────┘    └──────────────────┘    └─────┬─────┘  │
│          ▲                                             │        │
│          │ settleBetWin(betId, priceProof)             │verify  │
│          │                                             │        │
└──────────┼─────────────────────────────────────────────┼────────┘
           │                                             │
┌──────────┴─────────────────────────────────────────────┴────────┐
│                      SOLVER / SETTLER SERVICE                    │
│                                                                  │
│   BetScanner ──► PriceWatcher ──► BatchSettler                  │
│   (active bets)  (Pyth stream)    (call settleBetWin on win)    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                     PYTH NETWORK                                 │
│              BTC/USD · ETH/USD · MON/USD                        │
│    WebSocket stream (~400ms) + signed price proofs on demand    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Frontend (`tapx-frontend/`)

**Role**: The game interface. Renders the price grid, manages trading sessions, and reflects bet outcomes in real-time.

**Session flow (frontend state):**
```
User sets collateral + asset
    → clicks "Start Trading"
    → session active: every tap fires placeBet()
    → clicks "Stop Trading"
    → session ends
```

**Key responsibilities:**
- Render grid with live Pyth prices as the Y-axis anchor
- Calculate and display each cell's multiplier (matches what's in the contract)
- On tap: call `TapBetManager.placeBet()` immediately — no modal, no confirmation
- Listen for `BetWon` and `BetExpired` events via `watchContractEvent` for real-time feedback
- Show active bets as highlighted cells with a countdown timer
- Auto-payout notification when a bet wins

**Does NOT do:**
- Store any bet state locally
- Decide when to settle — that is the solver's job
- Compute final payout — that is the contract's job

---

### 2. Smart Contracts (`contracts/`)

**Role**: On-chain source of truth. Manages bets, holds and distributes funds via vault.

| Contract | Responsibility |
|---|---|
| `TapBetManager.sol` | Bet placement, win/expiry settlement, multiplier validation |
| `TapVault.sol` | Liquidity pool — receives losses, funds payouts |
| `MultiplierEngine.sol` | Compute multiplier from price distance and time window |
| `PriceAdapter.sol` | Pyth oracle wrapper — verify price proofs on-chain |

Full specs in [CONTRACTS.md](./CONTRACTS.md).

---

### 3. Solver / Settler Service (`tapx-solver/`)

**Role**: Off-chain service that monitors live prices and triggers on-chain settlement when a bet wins.

**Why is a solver needed?**

Smart contracts on EVM cannot react to external events autonomously — they only execute when called. The solver is the entity that watches Pyth prices and calls the settlement function at the right moment.

**Key responsibilities:**
- Subscribe to Pyth price stream for all active bet symbols
- Maintain a local map of active bets: `{ betId → { targetPrice, expiry, direction } }`
- When price crosses a target level: fetch Pyth price proof → call `settleBetWin(betId, priceProof)`
- Periodically scan for expired bets → call `settleExpired(betId)` (sends loss to vault)
- Collect small settlement fee per bet settled

**Anyone can run a solver.** The reference implementation is provided. Multiple solvers running simultaneously is safe and beneficial — the first to settle wins the fee, others' transactions revert harmlessly.

---

### 4. Pyth Network (Oracle)

**Role**: Provide real-time, verifiable price data.

**Two uses:**
1. **Frontend display**: Stream current price via Hermes WebSocket to animate the grid
2. **Settlement proof**: At win time, solver fetches a signed price update from Hermes API and submits it to `PriceAdapter.verifyAndGetPrice()` on-chain

**Why pull oracle fits this model**: Settlement only needs an oracle update when a bet actually wins. No on-chain oracle updates are wasted on bets that are still active. Gas is only spent at the moment of value transfer.

---

## Vault Economics

```
User places bet (10 USDC, 5x multiplier)
    │
    ├── Collateral (10 USDC) moves into TapVault
    │
    ├── [BET WINS]: Price touches target in time
    │       └── TapVault pays out 50 USDC to user (10 × 5x)
    │           Net vault flow: -40 USDC
    │
    └── [BET LOSES]: Time expires
            └── 10 USDC stays in TapVault
                Net vault flow: +10 USDC

House edge: multipliers are set so that
  Expected payout < 1.0 for vault over time
  (similar to casino odds — vault wins in aggregate)
```

**Vault liquidity risk:** If many bets win simultaneously (e.g., a flash crash), the vault must have sufficient liquidity to pay all winners. Multiplier calibration and vault depth management are critical for protocol sustainability.

---

## Data Flow: Bet Lifecycle

```
PLACEMENT
─────────
User taps a grid cell (e.g., BTC +2%, 5min window)
    → Frontend reads current Pyth price: $68,000
    → Target price = $68,000 × 1.02 = $69,360
    → Expiry = now + 5 minutes
    → Multiplier = 8x (from MultiplierEngine for 2% distance, 5min)
    → Frontend calls TapBetManager.placeBet(BTC, $69,360, expiry, 8x)
    → Contract validates multiplier matches engine output
    → Contract transfers 10 USDC from user to TapVault
    → BetPlaced event emitted

MONITORING
──────────
Solver has active bet: { target: $69,360, expiry: T+5min, direction: UP }
Solver receives Pyth price stream updates every ~400ms

WIN PATH
────────
Pyth stream shows: BTC price = $69,400 (crossed $69,360)
    → block.timestamp < expiry ✓
    → Solver fetches Pyth signed price proof
    → Solver calls TapBetManager.settleBetWin(betId, priceProof)
    → PriceAdapter verifies proof on-chain
    → Contract confirms: price ($69,400) >= target ($69,360) ✓
    → TapVault pays out 80 USDC to user (10 × 8x)
    → BetWon event emitted
    → Frontend shows win notification instantly

LOSS PATH
─────────
block.timestamp > expiry, price never reached $69,360
    → Solver (or anyone) calls TapBetManager.settleExpired(betId)
    → Contract confirms: timestamp > expiry AND bet still ACTIVE
    → 10 USDC stays in TapVault
    → BetExpired event emitted
    → Frontend shows cell as expired/lost
```

---

## Security Boundaries

| What | How it's protected |
|---|---|
| Payout amount | Contract computes payout from stored multiplier — solver cannot inflate |
| Price at settlement | Pyth proof verified on-chain by PriceAdapter — solver cannot fake price |
| Bet ownership | Payout always goes to `bet.user` — solver cannot redirect funds |
| Multiplier manipulation | Contract validates submitted multiplier against MultiplierEngine output |
| Vault drain | Vault tracks available liquidity; reverts if insufficient to cover payout |

---

## Monad-Specific Notes

### Parallel Settlement
Multiple `settleBetWin()` calls in the same block write to independent storage slots (each betId has its own mapping entry). Monad's parallel EVM can process these simultaneously — critical when price moves sharply and many bets win at once.

### 1-Second Blocks = Real-Time Feel
When a user taps and price immediately moves toward their target, they can see settlement happen within 1-2 blocks (~1-2 seconds). This makes the game feel live and reactive, not like waiting for a slow blockchain.

### Gas Per Bet
Each `placeBet()` call costs gas. At Monad's gas prices, this is negligible (< $0.001 per bet), making rapid multi-tap gameplay economically viable.
