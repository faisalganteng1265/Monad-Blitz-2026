# Solver / Settler Guide — TapX on Monad

> A solver monitors active bets and calls settlement on-chain when a bet's win condition is met. Anyone can run a solver.

---

## Role of the Solver

Smart contracts cannot watch external events autonomously. The solver is the off-chain service that:

1. Monitors the Pyth price stream in real-time
2. Tracks all ACTIVE bets from `TapBetManager`
3. Calls `settleBetWin(betId, priceProof)` the moment price touches a target
4. Calls `settleExpired(betId)` as a cleanup pass for expired bets
5. Earns a **settler fee** (0.5% of payout) for each bet it settles

**Solvers are pure upside for users.** Users do not pay solvers directly. The fee comes from the payout — the user always knows their net payout before betting (`collateral × multiplier - 0.5%`).

---

## Solver Economics

| Item | Value |
|---|---|
| Settler fee | 0.5% of gross payout |
| Example: 80 USDC payout | 0.40 USDC per settlement |
| Gas cost per `settleBetWin()` | ~0.0001 MON (Monad estimate) |
| Example: 100 settlements/day at 50 USDC avg payout | ~25 USDC/day revenue |

At high volume, running a fast, reliable solver is significantly profitable.

---

## Solver Service Architecture

```
tapx-solver/src/
├── index.ts              # Entry point — wires all services
├── services/
│   ├── BetScanner.ts     # Reads ACTIVE bets from chain + BetPlaced events
│   ├── PriceWatcher.ts   # Streams Pyth prices via Hermes WebSocket
│   ├── WinDetector.ts    # Checks each price update against active bet targets
│   ├── Settler.ts        # Fetches price proof + calls settleBetWin on-chain
│   └── ExpiryCleanup.ts  # Periodically settles expired bets
├── config.ts             # Env vars, addresses, ABIs
└── types.ts
```

---

## How Settlement Works (Step by Step)

### Win Settlement

```
1. PriceWatcher receives Pyth update: BTC = $69,380

2. WinDetector iterates active bets for BTC:
   betId=42: target=$69,360, direction=UP → $69,380 >= $69,360 ✓
   betId=55: target=$70,000, direction=UP → $69,380 < $70,000 ✗

3. For betId=42 (eligible):
   Check: block.timestamp < bet.expiry ✓

4. Settler fetches Pyth price proof:
   GET https://hermes.pyth.network/v2/updates/price/latest
       ?ids[]=BTC_USD_PRICE_ID
   → returns priceUpdateData (bytes[])

5. Settler submits:
   TapBetManager.settleBetWin(betId=42, priceUpdateData)

6. Monad confirms ~1 second later
   Solver receives 0.40 USDC settler fee
```

### Expiry Cleanup

```
ExpiryCleanup runs every 30 seconds:
    → Filters active bets where: block.timestamp > bet.expiry
    → Calls TapBetManager.batchSettleExpired([betId1, betId2, ...])
    → No fee for expiry settlement (just gas rebate — small incentive)
```

---

## Environment Setup

```bash
cd tapx-solver
npm install
cp .env.example .env
```

```env
# .env
PRIVATE_KEY=0x...
RPC_URL=https://testnet-rpc.monad.xyz
TAP_BET_MANAGER=0x...
TAP_VAULT=0x...
PRICE_ADAPTER=0x...
PYTH_HERMES_URL=https://hermes.pyth.network
PYTH_BTC_PRICE_ID=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
PYTH_ETH_PRICE_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
EXPIRY_CLEANUP_INTERVAL_MS=30000
```

```bash
npm run start
```

---

## BetScanner: Keeping the Active Bet Map Current

Two complementary approaches (both run simultaneously):

**Event subscription (primary):**
```typescript
client.watchContractEvent({
  address: TAP_BET_MANAGER,
  abi: TapBetManagerABI,
  eventName: 'BetPlaced',
  onLogs: (logs) => {
    logs.forEach(log => {
      activeBets.set(log.args.betId, {
        symbol:      log.args.symbol,
        targetPrice: log.args.targetPrice,
        expiry:      log.args.expiry,
        direction:   log.args.direction,
      });
    });
  }
});
```

**Startup sync (on launch):**
```typescript
const activeBetIds = await client.readContract({
  address: TAP_BET_MANAGER,
  abi: TapBetManagerABI,
  functionName: 'getActiveBets',
});
// Fetch and cache each bet's details
```

On `BetWon` or `BetExpired` events: remove from local map.

---

## WinDetector: Price Trigger Logic

```typescript
function checkTriggers(symbol: string, currentPrice: bigint) {
  for (const [betId, bet] of activeBets) {
    if (bet.symbol !== symbol) continue;
    if (Date.now() / 1000 >= bet.expiry) continue; // will be handled by cleanup

    const triggered =
      (bet.direction === 'UP'   && currentPrice >= bet.targetPrice) ||
      (bet.direction === 'DOWN' && currentPrice <= bet.targetPrice);

    if (triggered) {
      settleQueue.add(betId); // de-duplicated queue
    }
  }
}
```

The settle queue ensures a bet is not submitted twice if multiple price updates trigger it before the tx confirms.

---

## Race Conditions

Multiple solvers may attempt to settle the same bet simultaneously. This is safe:

- The first `settleBetWin()` tx to be confirmed updates bet status to `WON`
- All subsequent calls revert: `"Bet not active"`
- Reverted txs cost a small amount of gas — solvers internalize this risk

**Optimization:** Before submitting, solvers can read current bet status with a `eth_call` simulation. If already `WON`, skip submission.

---

## What Solvers Cannot Do

| Action | Why it's prevented |
|---|---|
| Fake the settlement price | `PriceAdapter` verifies Pyth cryptographic proof on-chain |
| Settle at wrong time | Contract checks `block.timestamp < bet.expiry` |
| Redirect payout | Payout always goes to `bet.user` — hardcoded in contract |
| Settle an already-won bet twice | Status check reverts any duplicate settlement |
| Claim more than the settler fee | Fee is computed by contract, not submitted by solver |
