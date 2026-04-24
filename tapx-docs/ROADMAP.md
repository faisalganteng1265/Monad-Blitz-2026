# Roadmap & Scope — TapX Hackathon

> Defines what is built for the Monad hackathon, build order, and team division.

---

## Hackathon Deliverable

A live demo on Monad testnet showing:

1. User sets collateral → clicks Start Trading
2. User taps a grid cell → bet placed on-chain within ~1 second
3. Price moves → solver settles the bet automatically → payout appears instantly
4. Multiple bets active simultaneously, settled independently
5. Expired bets cleaned up automatically

---

## Scope: In vs Out

### In Scope

| Feature | Description |
|---|---|
| Trading session setup | Set collateral per tap, choose asset, start/stop mode |
| Price grid | Live Pyth prices, dynamic multipliers per cell |
| Bet placement | Tap = on-chain bet, no confirmation modal |
| Win settlement | Solver detects trigger, auto-payout via vault |
| Expiry settlement | Cleanup for bets that never won |
| Vault model | Losses fund vault, vault funds payouts |
| Multiplier engine | On-chain multiplier table by price distance + time window |
| Solver service | Reference implementation for settlement |
| Real-time UI | On-chain event streaming for bet status updates |

### Out of Scope (Post-Hackathon)

| Feature | Reason |
|---|---|
| LP deposit/withdraw UI | Vault mechanics work; LP frontend is nice-to-have |
| Solver competition / MEV | Single reference solver sufficient for demo |
| Advanced multiplier calibration | Static table is fine for hackathon |
| Mobile app | Web only |
| Multiple assets beyond BTC/ETH | Two assets sufficient for demo |
| MON as collateral | USDC only — simpler for hackathon |
| On-chain governance for multipliers | Owner key sufficient for now |

---

## Build Order

### Phase 1: Contracts
> Target: Day 1–3

```
[1] PriceAdapter.sol         ← verify Pyth on Monad testnet first
[2] MultiplierEngine.sol     ← define multiplier table, write tests
[3] TapVault.sol             ← fund management, LP interface
[4] TapBetManager.sol        ← core logic, connects all above
[5] forge test               ← all passing, edge cases covered
[6] Deploy to Monad testnet
[7] Seed vault with initial USDC liquidity
```

**Critical first step:** Confirm Pyth Network is live on Monad testnet and get the contract address before writing PriceAdapter. Check: [https://docs.pyth.network/price-feeds/contract-addresses/evm](https://docs.pyth.network/price-feeds/contract-addresses/evm)

**Milestone:** Can place a bet via `cast send` and settle it via Foundry script with a mock price proof.

---

### Phase 2: Solver Service
> Target: Day 2–4 (parallel with contracts using mock)

```
[1] BetScanner: read active bets + subscribe to BetPlaced events
[2] PriceWatcher: connect to Pyth Hermes WebSocket (BTC, ETH)
[3] WinDetector: trigger logic for UP/DOWN bets
[4] Settler: fetch price proof + call settleBetWin
[5] ExpiryCleanup: periodic batch settle expired
[6] End-to-end test: place bet via script → solver settles it
```

**Milestone:** Place a bet manually, move the mock price past the trigger, confirm solver calls `settleBetWin` automatically and vault pays out.

---

### Phase 3: Frontend
> Target: Day 3–6

```
[1] Monad chain config + Privy setup
[2] Pyth Hermes WebSocket → live price display
[3] Grid canvas: cells with multipliers, current price anchor
[4] Session panel: collateral input, asset selector, Start/Stop button
[5] USDC approve (one-time)
[6] placeBet() on tap (no modal)
[7] Active bet highlights + countdown timers on grid cells
[8] BetWon / BetExpired event listeners → UI feedback
[9] Bet history panel
[10] Balance display (USDC in wallet)
```

**Milestone:** Full session: configure → tap 3 cells → watch one win and two expire → see correct payout.

---

### Phase 4: Demo Prep
> Target: Day 6–7

```
[1] Deploy clean contracts on Monad testnet
[2] Seed vault with enough USDC for demo payouts
[3] Start solver service (keep running during demo period)
[4] Demo script:
    • Show session setup
    • Tap multiple cells
    • Show Monad block explorer — each tap is a real tx
    • Price moves → solver settles → payout instant
    • Show one block with multiple settlements (parallel execution)
[5] Record backup video demo
```

---

## Team Division

| Role | Owns |
|---|---|
| Smart Contract Dev | All 4 contracts, Foundry tests, deploy script, vault seed |
| Solver Dev | tapx-solver service, Pyth Hermes integration, settlement logic |
| Frontend Dev | Next.js app, grid canvas, Wagmi hooks, Pyth price display, event streaming |
| Full-stack / PM | Frontend ↔ contract wiring, integration tests, docs, demo prep |

Frontend can start building UI with hardcoded mock multipliers and prices. Unblocks from contract deploy as long as ABIs are finalized first.

---

## Integration Checkpoints

| Checkpoint | What to Verify |
|---|---|
| Pyth on Monad | `PriceAdapter.getLatestPrice()` returns valid price |
| First bet placement | `TapBetManager.placeBet()` succeeds, collateral moves to vault |
| First win settlement | Solver calls `settleBetWin()`, user USDC balance increases |
| First expiry | `settleExpired()` processes without revert |
| Frontend live prices | Grid cells update price labels every ~400ms via Pyth stream |
| Frontend real-time | `BetWon` event triggers win animation within 1-2 seconds |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pyth not live on Monad testnet | Medium | Deploy `MockPyth.sol` for testnet; use real Pyth for mainnet |
| USDC not on Monad testnet | Medium | Deploy `MockUSDC.sol`, configure frontend accordingly |
| Vault insufficient liquidity during demo | Medium | Pre-seed vault with 10,000 mock USDC before demo |
| Solver misses a win (latency) | Low | Price window is seconds to minutes — not milliseconds |
| Multiplier mismatch revert | Low | Frontend and contract must use identical band boundaries |
| User drains vault with high-multiplier wins | Low | Calibrate multipliers conservatively; vault depth monitoring |

---

## Hackathon Judging Criteria Mapping

| Criterion | TapX response |
|---|---|
| **Monad utilization** | On-chain bet placement (viable only because of Monad's low gas); parallel settlement of multiple bets in one block |
| **Technical execution** | 4 contracts, solver service, real-time frontend — full stack |
| **Innovation** | Price prediction grid with vault model is a novel DeFi primitive; tap-based UX removes all trading complexity |
| **User experience** | No wallet switching, no order forms, no position management — tap and watch |
| **Completeness** | Win flow, loss flow, session flow all working end-to-end |

---

## Key Numbers for Demo

| Metric | Target |
|---|---|
| Tap → on-chain confirmation | ~1 second |
| Price touch → settlement | ~1-2 seconds |
| Supported assets | BTC, ETH |
| Grid size | 6 price bands × 5 time buckets = 30 cells per side |
| Multiplier range | 1.02x (easy) → 500x (hard) |
| Collateral options | 5 / 10 / 50 / 100 USDC or custom |
| USDC approve frequency | Once per wallet (infinite approval) |
