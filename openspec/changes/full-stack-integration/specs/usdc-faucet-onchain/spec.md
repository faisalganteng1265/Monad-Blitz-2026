## ADDED Requirements

### Requirement: User can claim test USDC directly from contract
The frontend SHALL call `MockUSDC.faucet()` via wagmi `writeContract` without routing through the backend. The button SHALL only be visible when the user's wallet is connected. After a successful transaction the USDC balance SHALL refresh automatically.

#### Scenario: Successful faucet claim
- **WHEN** an authenticated user clicks the Faucet button
- **THEN** the system calls `MockUSDC.faucet()` on Monad Testnet via the connected wallet
- **THEN** a loading toast is shown while the transaction is pending
- **THEN** a success toast with a Monad Explorer link is shown after the transaction confirms
- **THEN** the displayed USDC balance refreshes to reflect the new amount

#### Scenario: Wallet not connected
- **WHEN** the user is not authenticated
- **THEN** the Faucet button SHALL NOT be visible

#### Scenario: Contract reverts (cooldown active)
- **WHEN** the contract reverts (e.g., cooldown period not elapsed)
- **THEN** a human-readable error toast is displayed
- **THEN** the loading state is cleared and the button returns to its default state

### Requirement: Faucet hook uses wagmi writeContract
The `useUSDCFaucet` hook SHALL use wagmi's `useWriteContract` to send the transaction so it benefits from the connected wallet's signer and automatic chain validation.

#### Scenario: Hook calls correct contract
- **WHEN** `handleClaimUSDC` is invoked
- **THEN** the hook calls `writeContractAsync` with `address = USDC_ADDRESS`, `functionName = "faucet"`, and no arguments
- **THEN** the hook waits for the transaction receipt before marking the claim as complete
