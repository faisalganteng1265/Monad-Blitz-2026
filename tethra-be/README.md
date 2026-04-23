# Tethra DEX - Backend API

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![Chainlink](https://img.shields.io/badge/Oracle-Chainlink-blue)

Comprehensive backend service for Tethra DEX providing:
- 📊 **Real-time Price Feeds** (Chainlink Oracle)
- ✍️ **Price Signing** for on-chain verification
- 🚀 **Relay Service** for gasless transactions
- 🤖 **Automated Order Execution** (Limit orders, Grid trading, TP/SL)
- 📉 **Position Monitoring** with auto-liquidation
- 🎲 **One Tap Profit & Private Bet Settlement** (CRE integration)

## 🌟 Key Features

### Price Oracle & Signing
- ✅ **Chainlink Integration (Base Mainnet)** - BTC/ETH/SOL feeds for hackathon mode
- ✅ **Top 3 Crypto Pair Monitoring** - Focused crypto-only feed coverage
- ✅ **Price Signing** - ECDSA signatures for on-chain verification
- ✅ **WebSocket Broadcasting** - Real-time backend price broadcast
- ✅ **Health Monitoring** - Oracle freshness and service status checks

### Trading Automation
- ✅ **Limit Order Keeper** - Auto-executes limit orders when trigger price is reached
- ✅ **Grid Trading Bot** - Grid session/order lifecycle monitoring
- ✅ **TP/SL Monitor** - Auto-executes take-profit and stop-loss logic
- ✅ **Tap-to-Trade Executor** - Fast backend-only execution path
- ✅ **Position Monitor** - Auto-liquidates unhealthy positions
- ✅ **One Tap Profit Monitor** - Automatic bet settlement checks

### Chainlink CRE Integration
- ✅ **Private Bet Flow** - Place encrypted private bets with relay balance model
- ✅ **Batch Settlement Relay** - CRE posts settlement payloads to backend, backend relays on-chain
- ✅ **CRE Auth Guard** - Protected endpoints via `CRE_BACKEND_API_KEY`
- ✅ **CRE Keeper Mode** - Disable local keepers with `USE_CRE_KEEPER=true`

### Infrastructure
- ✅ **Relay Service** - Gasless transaction relay support
- ✅ **RESTful API** - Comprehensive endpoints for trading and settlement
- ✅ **WebSocket Server** - Real-time price stream
- ✅ **TypeScript** - Type-safe backend architecture

## 📋 Prerequisites

- Node.js >= 18.x
- npm or yarn

## 🚀 Installation

1. **Install dependencies**

```bash
npm install
```

2. **Setup environment variables**

```bash
cp .env.example .env
```

## ⚙️ Environment Configuration

### Core Configuration

```env
PORT=3001
NODE_ENV=development
DEBUG=true

RPC_URL=https://sepolia.base.org
PRICE_ORACLE_MODE=chainlink

RELAY_PRIVATE_KEY=
PRICE_SIGNER_PRIVATE_KEY=
FAUCET_PRIVATE_KEY=
```

### Contract Addresses

```env
USDC_TOKEN_ADDRESS=
TETHRA_TOKEN_ADDRESS=
VAULT_POOL_ADDRESS=
STABILITY_FUND_ADDRESS=

MARKET_EXECUTOR_ADDRESS=
POSITION_MANAGER_ADDRESS=
RISK_MANAGER_ADDRESS=
LIMIT_EXECUTOR_ADDRESS=
TAP_TO_TRADE_EXECUTOR_ADDRESS=
ONE_TAP_PROFIT_ADDRESS=

USDC_PAYMASTER_ADDRESS=

DEPLOYER_ADDRESS=
PRICE_SIGNER_ADDRESS=
KEEPER_ADDRESS=
TEAM_ADDRESS=
PROTOCOL_TREASURY_ADDRESS=
```

### Chainlink Oracle (Hackathon Mode)

```env
# Recommended RPC for Base Mainnet Chainlink feed reads
CHAINLINK_RPC_URL=https://base-rpc.publicnode.com

# Base Mainnet feeds
CHAINLINK_FEED_BTC=0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F
CHAINLINK_FEED_ETH=0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
CHAINLINK_FEED_SOL=0x975043adBb80fc32276CbF9Bbcfd4A601a12462D

# Optional polling interval (ms, minimum 1000)
# CHAINLINK_POLL_INTERVAL_MS=3000
```

### CRE Integration Flags

```env
# If true, local keeper-style services are disabled and CRE takes over
USE_CRE_KEEPER=true

# Required for CRE-authenticated settlement endpoints
CRE_BACKEND_API_KEY=

# Optional backend URL reference for CRE ops
CRE_BACKEND_URL=
```

### Stability Fund Streaming

```env
# Optional: default 360 minutes (6 hours)
VAULT_STREAM_INTERVAL_MINUTES=360
```

## 💻 Development

```bash
# Default dev command (uses env mode)
npm run dev

# Recommended for hackathon chainlink flow
npm run dev:chainlink
```

Server runs at `http://localhost:3001`

## 🏗️ Build & Production

```bash
# Build TypeScript to JavaScript
npm run build

# Run production
npm start
```

## 🧠 Runtime Behavior (CRE Mode)

When `USE_CRE_KEEPER=true`, these local services are intentionally disabled:
- `LimitOrderExecutor`
- `PositionMonitor`
- `StabilityFundStreamer`

This prevents duplicate executions when Chainlink CRE keeper workflow is active.

## 📡 API Endpoints

### System

#### Root
```bash
GET http://localhost:3001/
```

#### Health Check
```bash
GET http://localhost:3001/health
```

---

### Price API

#### Get All Prices
```bash
GET http://localhost:3001/api/price
# alias of /api/price/all
```

#### Get All Prices (explicit)
```bash
GET http://localhost:3001/api/price/all
```

#### Get Single Asset Price
```bash
GET http://localhost:3001/api/price/current/BTC
# alias: /api/price/BTC
```

#### Price Service Health
```bash
GET http://localhost:3001/api/price/health
```

#### Signed Price (for on-chain verification)
```bash
GET http://localhost:3001/api/price/signed/BTC
```

#### Verify Signature
```bash
POST http://localhost:3001/api/price/verify
```

#### Signer Status
```bash
GET http://localhost:3001/api/price/signer/status
```

---

### Relay API

```bash
GET  /api/relay/status
GET  /api/relay/balance/:address
POST /api/relay/transaction
```

---

### Limit / Grid / TP-SL / Tap-to-Trade

```bash
POST /api/limit-orders/create

POST /api/grid/create-session
POST /api/grid/place-orders
GET  /api/grid/user/:trader
GET  /api/grid/stats

POST /api/tpsl/set
GET  /api/tpsl/:positionId
GET  /api/tpsl/all
DELETE /api/tpsl/:positionId
GET  /api/tpsl/status

POST /api/tap-to-trade/create-order
POST /api/tap-to-trade/batch-create
GET  /api/tap-to-trade/orders
GET  /api/tap-to-trade/pending
POST /api/tap-to-trade/cancel-order
GET  /api/tap-to-trade/stats
```

---

### One Tap Profit (Public)

```bash
POST /api/one-tap/place-bet
POST /api/one-tap/place-bet-with-session
GET  /api/one-tap/bet/:betId
GET  /api/one-tap/bets
GET  /api/one-tap/active
POST /api/one-tap/calculate-multiplier
GET  /api/one-tap/stats
GET  /api/one-tap/status
```

### One Tap Profit (Private + CRE)

```bash
POST /api/one-tap/deposit-relay
GET  /api/one-tap/relay-balance/:trader
POST /api/one-tap/place-bet-private
POST /api/one-tap/withdraw-relay

# CRE-authenticated endpoints
POST /api/one-tap/cre-settle
GET  /api/one-tap/private-bet-encrypted/:betId
```

`/api/one-tap/cre-settle` and `/api/one-tap/private-bet-encrypted/:betId` require:

```http
Authorization: Bearer <CRE_BACKEND_API_KEY>
```

---

### Faucet API

```bash
POST /api/faucet/claim
GET  /api/faucet/status
```

## 📶 WebSocket

Connect to:

```text
ws://localhost:3001/ws/price
```

Message format:

```json
{
  "type": "price_update",
  "data": {
    "BTC": {
      "symbol": "BTC",
      "price": 98000.12,
      "timestamp": 1772827000000,
      "source": "chainlink"
    }
  },
  "timestamp": 1772827000123
}
```

## 🔗 Frontend Compatibility

No frontend breaking change is required for price reads:
- Existing path `/api/price/current/:symbol` remains valid
- Added aliases are backward-compatible (`/api/price`, `/api/price/:symbol`)

## 📊 Supported Chainlink Feeds (Current)

| Symbol | Feed Address | Network |
|--------|--------------|---------|
| BTC | `0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F` | Base Mainnet |
| ETH | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | Base Mainnet |
| SOL | `0x975043adBb80fc32276CbF9Bbcfd4A601a12462D` | Base Mainnet |

## 🛠️ Troubleshooting

### `Route GET /api/price/SOL not found`
Use either:
- `/api/price/current/SOL`
- `/api/price/SOL` (restart backend after update)

### `listen EADDRINUSE: address already in use :::3001`
Another process is already using port 3001.
- Stop previous backend process, or
- set a different `PORT` in `.env`

### `filter not found` (`eth_getFilterChanges`)
OneTap monitor now uses periodic on-chain sync (not volatile RPC filters). If you still see old logs, make sure old nodemon process is fully stopped.

### Chainlink feed read warnings
Some public RPC endpoints may fail for specific feed reads. Recommended:
- `CHAINLINK_RPC_URL=https://base-rpc.publicnode.com`

## 🧾 Change Notes

Important updates reflected here include:
- `67df49d91e390197513926f20bfc607f5f4ded0b` (CRE decentralized keeper + privacy settlement flow)
- `949c3c294f680ef16fe6afdac191293f009fc745` (CRE batch settlement endpoint + `settleBetBatch` integration)
- Latest backend updates for Chainlink mode, price endpoint aliases, and monitor reliability fixes
