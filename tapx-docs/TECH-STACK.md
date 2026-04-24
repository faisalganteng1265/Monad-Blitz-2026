# Tech Stack — TapX on Monad

> Rationale for every technology choice. Developers should understand the "why" before making changes.

---

## Blockchain

### Monad Testnet
- **Chain ID:** 10143
- **RPC:** `https://testnet-rpc.monad.xyz`
- **Explorer:** `https://testnet.monadexplorer.com`
- **Block time:** ~1 second
- **TPS:** ~10,000

**Why Monad:**
Monad's parallel EVM execution and high throughput make it the only EVM chain where a fully on-chain order book is economically viable. Gas per transaction is low enough that storing each tap order on-chain costs < $0.001. Sequential EVM chains (Ethereum, Base) cannot support this model without per-transaction costs making it unusable.

---

## Smart Contracts

### Solidity ^0.8.24
Standard EVM Solidity. No chain-specific opcodes used, ensuring the contracts could be ported if needed.

### Foundry
- **Why Foundry over Hardhat:** Faster compilation, native Solidity test files, built-in fuzzing, and script-based deployment with `forge script`. The `forge test --fuzz-runs 1000` flag is important for finding edge cases in price math and fee calculations.
- **Key commands:**
  ```bash
  forge build
  forge test
  forge test --match-test testBatchFill -vvvv
  forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
  ```

### OpenZeppelin Contracts 5.x
Used for: `ReentrancyGuard`, `Ownable`, `Pausable`, `IERC20`, `SafeERC20`.
Do not use older versions — v5 has breaking changes in access control patterns.

---

## Oracle

### Pyth Network (Pull Oracle)
- **Why Pyth over Chainlink:** Chainlink is not deployed on Monad testnet. Pyth is the standard oracle on Monad and uses a pull model that integrates naturally with the solver execution flow.
- **Pull model:** Prices are NOT automatically pushed on-chain. Solvers fetch a signed price proof from Pyth's Hermes API and submit it alongside fill transactions. This means oracle cost is only paid when a fill actually happens.
- **Hermes API:** `https://hermes.pyth.network`
- **Pyth contract on Monad testnet:** TBD — check [https://docs.pyth.network/price-feeds/contract-addresses/evm](https://docs.pyth.network/price-feeds/contract-addresses/evm)
- **SDK:**
  ```bash
  npm install @pythnetwork/pyth-evm-js
  npm install @pythnetwork/hermes-client
  ```

---

## Frontend

### Next.js 15 (App Router)
- **Why Next.js:** Server components for fast initial load, App Router for clean routing, built-in TypeScript support.
- **Important:** Use `"use client"` directive on all components that use Wagmi hooks or browser APIs.

### React 19
- Use concurrent features where appropriate.
- `useOptimistic` for immediate UI feedback while on-chain tx confirms.

### TypeScript 5
Strict mode enabled. All contract interaction types generated from ABIs using `wagmi generate`.

### TailwindCSS 4
Utility-first CSS. Do not use CSS modules or styled-components. All styling via Tailwind classes.

### Wagmi 2 + Viem 2
- **Wagmi:** React hooks for connecting wallets, reading contracts, writing transactions.
- **Viem:** Low-level Ethereum interactions, ABI encoding, event parsing.
- **Key hooks used:**
  - `useWriteContract` — for `placeTap()`, `cancelTap()`, `closePosition()`
  - `useReadContract` — for reading order book state
  - `useWatchContractEvent` — for real-time order status updates
  - `useWaitForTransactionReceipt` — for tx confirmation feedback

### Privy
- Social login (Google, Apple, email)
- Embedded wallets — users do not need MetaMask
- **SDK:** `@privy-io/react-auth`
- Configure Monad testnet as a supported chain in Privy dashboard

### Pyth Frontend SDK
```bash
npm install @pythnetwork/hermes-client
```
Used in `usePyth.ts` hook for streaming real-time prices to the grid canvas.

---

## Solver Service

### Node.js + TypeScript
Standalone service. Not part of the frontend. Can be run by anyone.

### Viem (not Ethers)
Consistent with the frontend. Use viem for contract reads/writes.

### Pyth Hermes Client
```bash
npm install @pythnetwork/hermes-client
```
WebSocket connection for streaming prices + REST for fetching price proofs at fill time.

### Environment
```bash
# .env
PRIVATE_KEY=0x...          # Solver's wallet private key
RPC_URL=https://testnet-rpc.monad.xyz
TAP_ORDER_BOOK=0x...
TAP_EXECUTOR=0x...
SOLVER_REGISTRY=0x...
PYTH_HERMES_URL=https://hermes.pyth.network
POLL_INTERVAL_MS=500
```

---

## Dependencies Summary

### Frontend (`tapx-frontend/package.json`)

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@privy-io/react-auth": "latest",
    "wagmi": "^2.0.0",
    "viem": "^2.0.0",
    "@pythnetwork/hermes-client": "latest",
    "@tanstack/react-query": "^5.0.0",
    "lightweight-charts": "^4.0.0",
    "axios": "^1.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "latest",
    "sonner": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0"
  }
}
```

### Solver (`tapx-solver/package.json`)

```json
{
  "dependencies": {
    "viem": "^2.0.0",
    "@pythnetwork/hermes-client": "latest",
    "@pythnetwork/pyth-evm-js": "latest",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "latest"
  }
}
```

### Contracts (`contracts/`)

```toml
# foundry.toml
[dependencies]
openzeppelin = "5.0.0"
pyth-sdk-solidity = { git = "https://github.com/pyth-network/pyth-crosschain", tag = "latest" }
```

---

## What Was Removed (vs Tethra)

| Tethra Technology | Status | Reason |
|---|---|---|
| Chainlink Price Feeds | Removed | Not on Monad testnet |
| Chainlink CRE | Removed | Replaced by open solver/settler network |
| Express.js backend | Removed | No centralized backend needed |
| Backend in-memory store | Removed | All state on-chain |
| Ethers.js | Removed | Replaced by Viem exclusively |
| Three.js / React Three Fiber | Removed | Out of scope |
| GSAP animations | Removed | Out of scope |
| KlineCharts | Removed | Using Lightweight Charts only |
| PositionManager | Removed | TapX has no ongoing positions — bets resolve instantly |
| TapExecutor / order book | Removed | Replaced by TapBetManager + TapVault |
| Leverage / liquidation logic | Removed | Not applicable — fixed multiplier replaces leverage |
| Grid Trading Context | Removed | Separate feature, not in scope |
| OneTapProfit | Absorbed | TapX IS the OneTapProfit concept, generalized |

---

## Environment Variables Reference

### Frontend

```env
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_TAP_BET_MANAGER=0x...
NEXT_PUBLIC_TAP_VAULT=0x...
NEXT_PUBLIC_MULTIPLIER_ENGINE=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_PYTH_CONTRACT=0x...
NEXT_PUBLIC_PYTH_HERMES_URL=https://hermes.pyth.network
NEXT_PUBLIC_PYTH_BTC_PRICE_ID=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
NEXT_PUBLIC_PYTH_ETH_PRICE_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
```

### Solver

```env
PRIVATE_KEY=0x...
RPC_URL=https://testnet-rpc.monad.xyz
TAP_BET_MANAGER=0x...
TAP_VAULT=0x...
PYTH_HERMES_URL=https://hermes.pyth.network
PYTH_BTC_PRICE_ID=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
PYTH_ETH_PRICE_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
EXPIRY_CLEANUP_INTERVAL_MS=30000
MIN_BATCH_SIZE=1
MAX_BATCH_SIZE=100
```

### Contracts (Foundry Deploy Script)

```env
PRIVATE_KEY=0x...         # Deployer wallet
RPC_URL=https://testnet-rpc.monad.xyz
PYTH_CONTRACT=0x...       # Pyth contract on Monad testnet
USDC_ADDRESS=0x...        # USDC on Monad testnet
```
