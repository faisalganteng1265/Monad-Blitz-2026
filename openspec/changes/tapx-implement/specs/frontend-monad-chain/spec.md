## ADDED Requirements

### Requirement: Monad Testnet chain replaces baseSepolia in all frontend config
`baseSepolia` import and all references MUST be removed from `Tethra-Front-End/`. A custom Monad Testnet chain definition MUST be added (chainId 10143, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadexplorer.com`). Privy configuration MUST include Monad Testnet as a supported chain.

#### Scenario: Wagmi configured with Monad Testnet
- **WHEN** app initializes
- **THEN** wagmi config lists Monad Testnet (chainId 10143) as the primary chain

#### Scenario: No baseSepolia reference remains
- **WHEN** TypeScript compilation runs
- **THEN** no import of `baseSepolia` from `viem/chains` exists in bet-related code

#### Scenario: Privy supports Monad Testnet
- **WHEN** user connects wallet via Privy
- **THEN** Monad Testnet is listed as a supported chain in Privy config

### Requirement: config/contracts.ts is updated with TapX contract addresses
`Tethra-Front-End/src/config/contracts.ts` MUST export `TAP_BET_MANAGER_ADDRESS`, `TAP_VAULT_ADDRESS`, `MULTIPLIER_ENGINE_ADDRESS`, `PRICE_ADAPTER_ADDRESS`. `STABILITY_FUND_ADDRESS` MUST be removed. Values are initially set to env vars (`process.env.NEXT_PUBLIC_TAP_BET_MANAGER` etc.) with a placeholder until deployment.

#### Scenario: Contract addresses loaded from env vars
- **WHEN** `NEXT_PUBLIC_TAP_BET_MANAGER` env var is set
- **THEN** `TAP_BET_MANAGER_ADDRESS` in config returns the correct address

### Requirement: New ABI files added for TapX contracts
`Tethra-Front-End/src/contracts/abis/` MUST contain `TapBetManager.json`, `TapVault.json`, `MultiplierEngine.json`, `PriceAdapter.json`. These are generated from Foundry compiled artifacts. Old `USDCPaymaster.json` may be retained but no longer referenced in trading flow.

#### Scenario: TapBetManager ABI contains placeBet function
- **WHEN** `TapBetManager.json` is imported
- **THEN** it contains the `placeBet` function ABI entry with correct parameter types
