# Tethra DEX - Smart Contracts

![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)
![Foundry](https://img.shields.io/badge/Foundry-Latest-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

Perpetual futures trading protocol with **up to 100x leverage**, built on Base with Account Abstraction (USDC gas payments) and privileged smart wallets integration.

## 🌟 Key Features

- ⚡ **Instant Market Orders** - Execute trades immediately at current oracle price
- 📊 **High Leverage** - Up to 100x on all pairs
- 🎯 **Advanced Orders** - Limit orders, stop-loss, take-profit, grid trading
- 💵 **USDC Gas Payments** - Pay transaction fees in USDC via Account Abstraction
- 🎲 **One Tap Profit and Quick Tap** - Short-term price prediction betting (30s-5min)
- 🔐 **Privy Smart Wallets** - Embedded wallets with email/social login
- 💎 **Dual Token Economy** - USDC for trading, TETH for governance & rewards

## 🚀 Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Base Sepolia ETH for deployment (get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet))
- Private key with ETH for deployment

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd tethra-dex/tethra-sc

# Install dependencies
forge install

# Compile contracts
forge build
```

### Testing

```bash
# Run all tests
forge test

# Run with gas report
forge test --gas-report

# Run with verbose output
forge test -vvv
```

## 📁 Project Structure

```
tethra-sc/
├── src/
│   ├── token/
│   │   ├── TethraToken.sol          # TETH governance token (10M supply)
│   │   └── MockUSDC.sol             # Test USDC with faucet
│   ├── risk/
│   │   └── RiskManager.sol          # Trade validation & risk checks
│   ├── trading/
│   │   ├── PositionManager.sol      # Position tracking & PnL calculation
│   │   ├── MarketExecutor.sol       # Market order execution
│   │   ├── LimitExecutor.sol        # Limit/stop-loss orders
│   │   ├── TapToTradeExecutor.sol   # Fast tap-to-trade orders
│   │   └── OneTapProfit.sol         # Price prediction betting
│   ├── treasury/
│   │   └── StabilityFund.sol        # Buffer first-loss, fee splitter, streaming
│   ├── paymaster/
│   │   └── USDCPaymaster.sol        # Account Abstraction paymaster
│   └── staking/
│       ├── TethraStaking.sol        # Stake TETH → Earn USDC
│       └── VaultPool.sol            # LP vault (USDC shares)
├── script/
│   └── FullDeploy.s.sol             # Complete deployment script
├── test/                            # Foundry tests
└── foundry.toml                     # Foundry configuration
```

## 📦 Smart Contracts Overview

### Core Trading Contracts (5)

| Contract | Description | Key Features |
|----------|-------------|------------|
| **RiskManager** | Trade validation & risk management | Leverage limits (100x All Pairs), Liquidation checks |
| **PositionManager** | Position tracking & PnL | Real-time PnL calculation, Position history |
| **MarketExecutor** | Market order execution | Instant fills, Signed price verification |
| **LimitExecutor** | Advanced orders | Limit orders, Stop-loss, Take-profit, Grid trading |
| **StabilityFund** | Buffer first-loss, fee splitter, pays wins before pool | Absorbs losses, pays wins, streams surplus to pool |

### Infrastructure Contracts (3)

| Contract | Description | Purpose |
|----------|-------------|------|
| **TethraToken** | TETH governance token | 10M supply, Staking rewards, Governance |
| **MockUSDC** | Test USDC | Faucet (1,000 USDC/claim) for testing |
| **USDCPaymaster** | Account Abstraction | Pay gas fees with USDC |

### Incentive Contracts (2)

| Contract | Description | Rewards |
|----------|-------------|------|
| **TethraStaking** | Stake TETH tokens | Earn 30% of trading fees in USDC |
| **VaultPool** | Provide USDC liquidity | Share-based LP pool backing trader payouts |

### Specialty Trading (2)

| Contract | Description | Features |
|----------|-------------|------|
| **TapToTradeExecutor** | Fast order execution | Backend-managed instant trades |
| **OneTapProfit** | Price prediction betting | 30s-5min duration, 2x multiplier |

## 🔧 Deployment

### Quick Deploy (All Contracts)

```bash
forge script script/FullDeploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY \
  --broadcast
```

This will:
1. Deploy core contracts (VaultPool, StabilityFund, Market/Limit/Tap/OTP, token, staking, paymaster)
2. Grant roles (SETTLER/KEEPER + backend signer)
3. Initialize TethraToken distribution
4. Wire executors to StabilityFund and StabilityFund to VaultPool
5. Save deployment addresses to `deployments/base-sepolia-latest.json`

### Deploy to Different Networks

**Base Sepolia (Testnet):**
```bash
forge script script/FullDeploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY \
  --broadcast
```

**Base Mainnet (Production):**
```bash
forge script script/FullDeploy.s.sol \
  --rpc-url https://mainnet.base.org \
  --private-key YOUR_PRIVATE_KEY \
  --broadcast \
  --verify
```

### Post-Deployment

After deployment, you'll get a JSON file at `deployments/base-sepolia-latest.json` with all contract addresses. **Copy these addresses to your backend `.env` file!**

## 💰 Token Distribution

**TETH Token (10,000,000 total):**
- 50% (5M) → Staking Rewards
- 20% (2M) -> VaultPool liquidity allocation  
- 20% (2M) → Team
- 10% (1M) → Treasury

Distribution is automatic during deployment via `TethraToken.initialize()`.

## 💵 Fee Structure

| Action | Fee | Recipient |
|--------|-----|-----------|  
| Market Trade | 0.05% of position size | Protocol (split 50/30/20) |
| Limit Order Execution | 0.05% of position size | Keeper |
| Liquidation | 0.5% of position | Liquidator |
| Early Unstake (Staking) | 10% | Treasury |
| Early Withdrawal (LP) | 15% | Treasury |

**Fee Distribution:**
- 50% → Liquidity Pool (backs trader profits)
- 30% → TETH Stakers (via TethraStaking)
- 20% → Protocol Treasury

## 🔐 Access Control & Roles

The deployment script automatically grants these roles:

### StabilityFund
- `EXECUTOR_ROLE` → MarketExecutor, LimitExecutor, TapToTradeExecutor, OneTapProfit
- `KEEPER_ROLE` → Backend keeper address (for liquidations)

### LimitExecutor
- `KEEPER_ROLE` → Backend keeper address (for limit order execution)

### MarketExecutor  
- `PRICE_SIGNER_ROLE` → Backend price signer address

## 🛡️ Security Features

- ✅ **OpenZeppelin Contracts** - Battle-tested security libraries
- ✅ **ReentrancyGuard** - All state-changing functions protected
- ✅ **Access Control** - Role-based permissions (RBAC)
- ✅ **SafeERC20** - Safe token transfers
- ✅ **Signed Prices** - ECDSA verification (5-minute validity)
- ✅ **Immutable Contracts** - No upgradability (trustless)
- ✅ **Oracle Validation** - Price freshness checks

## 🧪 Testing

```bash
# Run all tests
forge test

# Test specific contract
forge test --match-contract PositionManagerTest

# Test with gas report
forge test --gas-report

# Test with coverage
forge coverage
```

## 🚀 Next Steps

After deploying contracts:

1. **Update Backend**
   - Copy contract addresses to `tethra-be/.env`
   - Grant PRICE_SIGNER_ROLE to backend signer
   - Fund relay wallet with ETH

2. **Update Frontend**
   - Update contract addresses in frontend config
   - Test market orders
   - Test limit orders

3. **Add Liquidity**
   - Fund StabilityFund (buffer) and VaultPool with USDC (mint/transfer for testing)
   - Initial recommendation: 10,000 USDC minimum

4. **Test Trading**
   - Claim Mock USDC from faucet
   - Open test positions
   - Verify PnL calculations

## 🔗 Important Links

- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Base Mainnet Explorer](https://basescan.org/)
- [Foundry Book](https://book.getfoundry.sh/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

---

**Built with ❤️ by Tethra DEX Team using Foundry**

For questions or support, please open an issue on GitHub.