#!/bin/bash
# ============================================================
# Supra Move Contract Deploy Script
# Usage: ./deploy.sh <package-name> [testnet|mainnet]
# ============================================================

PACKAGE_NAME=${1:-"myProject"}
NETWORK=${2:-"testnet"}
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
echo "  Network : $NETWORK"
echo "  RPC     : $RPC_URL"
echo "=========================================="

# Step 1: Compile
echo ""
echo "🔨 Step 1: Compiling package..."
supra move tool compile --package-dir $PACKAGE_DIR

if [ $? -ne 0 ]; then
  echo "❌ Compilation failed. Fix errors and retry."
  exit 1
fi
echo "✅ Compilation successful!"

# Step 2: Fund from faucet (testnet only)
if [ "$NETWORK" = "testnet" ]; then
  echo ""
  echo "💧 Step 2: Funding account from testnet faucet..."
  supra move account fund-with-faucet --rpc-url $RPC_URL
  echo "✅ Account funded!"
fi

# Step 3: Publish
echo ""
echo "🚀 Step 3: Publishing package to $NETWORK..."
supra move tool publish --package-dir $PACKAGE_DIR --rpc-url $RPC_URL

if [ $? -ne 0 ]; then
  echo "❌ Deployment failed."
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ Contract deployed successfully!"
echo "🔭 View on Explorer: https://suprascan.io"
echo "=========================================="
