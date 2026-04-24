#!/bin/bash
set -e

source "$(dirname "$0")/.env"

echo "Deploying TapX contracts..."
~/.foundry/bin/forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY"
