## Context

The current Tethra codebase has three packages: `tethra-sc` (Foundry contracts), `tethra-be` (Express.js backend), and `Tethra-Front-End` (Next.js 15). The contracts use a centralized `SETTLER_ROLE` — only the backend keeper wallet can settle bets, and settlement passes a `bool won` parameter that the backend computes off-chain. There is no on-chain price verification. The frontend never calls contracts directly: it signs a message, sends it to the backend, and the backend relays via keeper.

The tapx-docs define a radically different architecture:
- Users call `placeBet()` directly (no relay, no keeper)
- Settlement is permissionless and requires a cryptographic Pyth price proof submitted on-chain
- Multipliers come from a fixed table, not a continuous formula
- The backend is replaced by a stateless solver service that anyone can run

The existing code has no part that "works" for the TapX flow out of the box. Every layer requires changes. The goal is surgical replacements within the existing directory structure — not a fresh monorepo scaffold.

## Goals / Non-Goals

**Goals:**
- Replace `OneTapProfit.sol` and `VaultPool.sol` with TapX contracts (TapBetManager, TapVault, MultiplierEngine, PriceAdapter) in `tethra-sc/src/`
- Repurpose `tethra-be/` as the solver service: delete backend HTTP layer, keep Pyth WebSocket logic, add Viem-based chain interaction
- Fix the frontend to call contracts directly, render a 6×5 live grid, and listen to chain events for bet outcomes — all on Monad Testnet
- Preserve existing UI scaffolding (layout, Privy, TailwindCSS, lucide-react, sonner) — only touch trading-specific files

**Non-Goals:**
- Migrate to a new directory structure (keep tethra-sc / tethra-be / Tethra-Front-End names)
- Add private bets, Chainlink CRE, or session key functionality (removed entirely)
- Mainnet deployment
- VaultPool LP analytics dashboard

## Decisions

### D1: Reuse Foundry project structure in tethra-sc, not a new contracts/ directory
**Decision**: Keep `tethra-sc/` as the Foundry root. Replace source files in-place.
**Rationale**: `foundry.toml`, `lib/` (openzeppelin, forge-std), and `.gitmodules` are already set up. Pyth SDK is the only new dependency.
**Alternative**: Fresh `contracts/` directory — rejected; would duplicate existing foundry setup.

### D2: Add Pyth SDK Solidity as a new forge dependency
**Decision**: `forge install pyth-network/pyth-crosschain` in `tethra-sc/`.
**Rationale**: PriceAdapter.sol needs `IPyth` interface and `PythStructs`. The SDK provides these without custom implementations.
**Risk**: Pyth contract address on Monad testnet must be confirmed before deploy.

### D3: Keep tethra-be directory name, repurpose as solver-only
**Decision**: Delete all HTTP/Express/relay/route files in `tethra-be/src/`, keep `PythPriceService.ts` as the base for PriceWatcher, and rewrite `index.ts` as solver entry point.
**Rationale**: Avoids creating a parallel `tapx-solver/` directory while existing code is present.
**What's deleted**: `routes/`, `services/RelayService.ts`, `services/SessionKeyValidator.ts`, `services/OneTapProfitService.ts`, `services/StabilityFundStreamer.ts`, `services/PriceSignerService.ts`, `services/ChainlinkPriceService.ts`.
**What's kept**: `Logger.ts`, `PythPriceService.ts` (adapted), `NonceManager.ts`, `types/index.ts` (updated).
**What's added**: `BetScanner.ts`, `WinDetector.ts`, `Settler.ts`, `ExpiryCleanup.ts`.

### D4: Replace ethers.js with viem in the solver
**Decision**: The solver uses `viem` for all on-chain interaction (contract reads, wallet client, event watching).
**Rationale**: Frontend already uses viem; consistent tooling. Viem's `watchContractEvent` and `writeContract` match the tapx-docs examples exactly.
**Migration**: Remove `ethers` from `tethra-be/package.json`, add `viem` (already present), add `@pythnetwork/pyth-evm-js`.

### D5: Frontend calls TapBetManager directly via useWriteContract
**Decision**: Replace all backend API calls in `useOneTapProfitBetting.ts` with a direct `useWriteContract` + `useWatchContractEvent` pattern.
**Rationale**: No backend = no relay = simpler mental model. Wagmi/viem already installed. This is the canonical approach for Monad.
**USDC approval target change**: Currently approves `STABILITY_FUND_ADDRESS`. New target is `TapBetManager` address.

### D6: Remove OneTapProfitModal — tap is immediate
**Decision**: Delete `OneTapProfitModal.tsx`. The grid cell `onClick` calls `placeBet()` immediately.
**Rationale**: Core tapx UX is "tap = bet, no confirmation". The modal is the antithesis of this.
**User feedback**: Move to toast notifications (sonner, already installed) for tx status.

### D7: Mirror MultiplierEngine table in TypeScript
**Decision**: Add a pure TypeScript function `getMultiplier(currentPrice, targetPrice, timeToExpiry)` in `src/features/trading/lib/multiplierEngine.ts` with the exact same band boundaries and table values as the Solidity contract.
**Rationale**: Grid cell multiplier display must match what the contract will validate. Single source of truth is the Solidity contract; TypeScript mirrors it.

### D8: Monad Testnet chain config replaces baseSepolia everywhere
**Decision**: Update `app/providers.tsx`, wagmi config, and all `useWalletClient` / `createWalletClient` calls to use `monad` chain (chainId 10143, RPC `https://testnet-rpc.monad.xyz`).
**Rationale**: baseSepolia is the old chain; Monad Testnet is the target.
**Impact**: Need to define a custom viem chain for Monad testnet since it's not in viem's built-in chain list yet.

### D9: StabilityFund is not deployed or referenced
**Decision**: Delete `StabilityFund.sol` from `tethra-sc/src/`. Do not deploy it. Remove all references.
**Rationale**: TapBetManager talks directly to TapVault. The buffer/streaming layer is not in the tapx-docs spec.

### D10: TapVault is adapted from VaultPool, not rewritten from scratch
**Decision**: Rename `VaultPool.sol` → `TapVault.sol` and modify in-place.
**Rationale**: LP deposit/withdraw share accounting in `VaultPool.sol` is correct and well-tested. Only the payout/collect interface needs to change.
**Changes to VaultPool**: Remove `virtualSupply`, `earlyExitFeeBps`, `lockPeriod`, `streamToVault`, `receiveFromSettlement`, `apyEstimateBps`. Add `collectCollateral(uint256)` onlyBetManager, `payout(address, uint256)` onlyBetManager, `setBetManager(address)`.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Pyth contract address on Monad testnet unknown | `PriceAdapter.setPriceId` is owner-callable; deploy with placeholder and update post-confirmation |
| USDC contract address on Monad testnet may differ | Use MockUSDC (already in tethra-sc) for testnet; update `USDC_ADDRESS` env var post-deploy |
| Existing OneTapProfitPrivate.t.sol tests will fail after contract replacement | Delete old tests; write new ones. No value in keeping tests for deleted contracts |
| Solver's viem `watchContractEvent` may miss events on public RPC | Add startup `getActiveBets()` sync as fallback; same pattern as old monitor's periodic sync |
| Frontend `useWatchContractEvent` may not work on all public Monad RPCs | Add polling fallback via `useReadContract` for `getUserBets()` every 5s |
| `@pythnetwork/hermes-client` API changes | Pin version; test proof fetching before deploy |

## Migration Plan

1. **Contracts**: Replace files → `forge build` → `forge test` → deploy to Monad testnet → record addresses
2. **Solver**: Update `tethra-be/package.json` (add viem, remove ethers) → delete old files → write new solver files → test locally with mock addresses → run against testnet
3. **Frontend**: Update chain + contract addresses → replace hooks → add grid component → verify Privy + Wagmi work on Monad → smoke test full bet flow in browser
4. **Integration**: Run solver against testnet, tap a bet in the frontend, confirm settlement shows up as win/loss notification

## Open Questions

- What is the official Pyth contract address on Monad testnet? (Check https://docs.pyth.network/price-feeds/contract-addresses/evm)
- What is the USDC address on Monad testnet? (May need to use MockUSDC)
- Should `tethra-be` be renamed to `tapx-solver` in package.json `name` field? (Recommend yes for clarity)
- Should the `tethra-sc` foundry.toml be updated to rename the project? (Recommend yes)
