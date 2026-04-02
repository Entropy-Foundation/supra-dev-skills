#!/bin/bash
# ============================================================
# Supra Move Contract Deploy Script
#
# Usage (from INSIDE the supra_cli container):
#   ./deploy.sh <package-name> <profile-name> [testnet|mainnet]
#
# Example:
#   ./deploy.sh myProject myAccount testnet
#
# ⚠️  This script must be run INSIDE the Docker container:
#   docker exec -it supra_cli /bin/bash
#   Then: ./deploy.sh myProject myAccount testnet
#
# All supra CLI commands only work inside the container.
# Running this from the host shell will fail.
# ============================================================

PACKAGE_NAME=${1:-""}
PROFILE=${2:-""}
NETWORK=${3:-"testnet"}

# ── Validate required arguments ────────────────────────────
if [ -z "$PACKAGE_NAME" ]; then
  echo "❌ Error: package name is required."
  echo "Usage: ./deploy.sh <package-name> <profile-name> [testnet|mainnet]"
  exit 1
fi

if [ -z "$PROFILE" ]; then
  echo "❌ Error: profile name is required."
  echo "Usage: ./deploy.sh <package-name> <profile-name> [testnet|mainnet]"
  echo ""
  echo "To create a profile: supra key generate --key-type ed25519 --profile <name>"
  echo "To list profiles:    supra profile list"
  exit 1
fi

PACKAGE_DIR="/supra/move_workspace/$PACKAGE_NAME"

if [ "$NETWORK" = "mainnet" ]; then
  RPC_URL="https://rpc-mainnet.supra.com"
else
  RPC_URL="https://rpc-testnet.supra.com"
  NETWORK="testnet"
fi

echo "=========================================="
echo "  Supra Move Deploy Script"
echo "  Package : $PACKAGE_NAME"
echo "  Profile : $PROFILE"
echo "  Network : $NETWORK"
echo "  RPC     : $RPC_URL"
echo "=========================================="

# ── Step 1: Compile ────────────────────────────────────────
echo ""
echo "Step 1: Compiling package..."
supra move tool compile --package-dir $PACKAGE_DIR

if [ $? -ne 0 ]; then
  echo "Compilation failed. Fix errors and retry."
  exit 1
fi
echo "Compilation successful!"

# ── Step 2: Fund from faucet (testnet only) ────────────────
if [ "$NETWORK" = "testnet" ]; then
  echo ""
  echo "Step 2: Funding account from testnet faucet..."
  echo "Note: This also creates the account on-chain if it doesn't exist yet."
  supra move account fund-with-faucet \
    --profile $PROFILE \
    --rpc-url $RPC_URL
  echo "Account funded!"
fi

# ── Step 3: Publish ────────────────────────────────────────
echo ""
echo "Step 3: Publishing package to $NETWORK..."
supra move tool publish \
  --package-dir $PACKAGE_DIR \
  --profile $PROFILE \
  --rpc-url $RPC_URL

if [ $? -ne 0 ]; then
  echo "Deployment failed."
  exit 1
fi

echo ""
echo "=========================================="
echo "Contract deployed successfully!"
echo "View on Explorer: https://suprascan.io"
echo "=========================================="
