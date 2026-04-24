# TapX — Tap to Trade on Monad

> On-chain price prediction grid. Tap a cell, bet that price will touch it. Win instantly when it does.

---

## What is TapX?

TapX is a price prediction game built on Monad. Users are presented with a **price grid** overlaid on a live chart. Each cell on the grid represents a specific price level and time window.

**The mechanic is simple:**
1. Set your collateral per tap and click **Start Trading**
2. Tap any cell on the grid
3. If the market price **touches** that cell's price level before the cell's time expires → **you win instantly**, receiving your collateral × that cell's multiplier
4. If time runs out before price gets there → **you lose**, collateral goes to the vault

Every cell has a different multiplier. Cells that are far from current price or have a short time window are harder to win — they pay more. Cells that are close to current price or have a long time window are easier — they pay less.

---

## Core Mechanics

### The Grid

```
Price ↑   │  1 min  │  5 min  │  15 min │  30 min │  1 hr   │
──────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
+5%       │  50x    │  25x    │  12x    │   6x    │  3.5x   │
+2%       │  15x    │   8x    │   5x    │   3x    │   2x    │
+1%       │   6x    │   4x    │  2.5x   │  1.8x   │  1.3x   │
──────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
 CURRENT  │ ← current market price (live) ─────────────────  │
──────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
-1%       │   6x    │   4x    │  2.5x   │  1.8x   │  1.3x   │
-2%       │  15x    │   8x    │   5x    │   3x    │   2x    │
-5%       │  50x    │  25x    │  12x    │   6x    │  3.5x   │
```

### Trading Session

Users do not set parameters per-tap. They set everything **once** before entering the grid:

1. Choose the asset (BTC, ETH, MON)
2. Set collateral per tap (e.g. 10 USDC per tap)
3. Click **Start Trading** → session is active
4. Every tap from that point costs exactly that collateral
5. To change collateral → exit trading mode, reconfigure, restart

### Win Condition

```
A bet wins when:
  market price TOUCHES the target price level
  AND the current time is still within the bet's time window
```

Settlement is **instant and automatic**. As soon as the market price crosses the target level, the solver settles the bet on-chain and the payout is transferred immediately. No claiming.

### Loss Condition

```
A bet loses when:
  the time window expires
  AND price never touched the target level
```

Losing collateral flows into the **TapVault** — the protocol liquidity pool that funds all payouts.

---

## Vault Model

TapX uses a house vault model:

- Losing bets → collateral enters TapVault
- Winning bets → payout (collateral × multiplier) comes from TapVault
- Multipliers are calibrated so the vault is statistically profitable over time
- Liquidity Providers can deposit into the vault to earn yield from the house edge

---

## Why Monad?

| Monad Property | How TapX uses it |
|---|---|
| ~1 second block time | Winning bets settled in real-time as price moves |
| 10,000 TPS | Hundreds of simultaneous bets across all users without congestion |
| Parallel EVM | Batch settlement of multiple winning bets in one block |
| Low gas | Placing each tap as a real on-chain transaction is economically viable |

On any other EVM chain, the gas cost per bet or the block latency would break the UX. Monad makes it work.

---

## Repository Structure

```
tapx-monad/
├── contracts/          # Foundry — smart contracts
├── tapx-frontend/      # Next.js 15 — trading interface
├── tapx-solver/        # Node.js — settlement service
└── docs/
    ├── README.md           ← You are here
    ├── ARCHITECTURE.md     ← System components & how they connect
    ├── CONTRACTS.md        ← Smart contract specs
    ├── FLOW.md             ← User & system flows
    ├── TECH-STACK.md       ← Technology choices & rationale
    └── SOLVER.md           ← Solver/settler service guide
```
