#!/bin/bash
set -e

# Load env
source "$(dirname "$0")/.env"

echo "Deploying MockUSDC..."
~/.foundry/bin/forge script script/DeployMockUSDC.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY"
