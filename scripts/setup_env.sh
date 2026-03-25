#!/bin/bash
# ============================================================
# Supra CLI Setup Script
# Sets up the Supra CLI using Docker
# ============================================================

echo "=========================================="
echo "  Supra CLI Environment Setup"
echo "=========================================="

# Check Docker is installed
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed."
  echo "Please install Docker Desktop from: https://www.docker.com/"
  exit 1
fi

# Check Docker daemon is running
if ! docker info &> /dev/null; then
  echo "❌ Docker daemon is not running."
  echo "Please start Docker Desktop and try again."
  exit 1
fi

echo "✅ Docker is installed and running."

# Pull and start the Supra CLI container
echo ""
echo "📦 Pulling and starting the Supra CLI container..."
curl https://raw.githubusercontent.com/supra-labs/supra-dev-hub/refs/heads/main/Scripts/cli/compose.yaml | docker compose -f - up -d

if [ $? -ne 0 ]; then
  echo "❌ Failed to start the Supra CLI container."
  exit 1
fi

echo ""
echo "✅ Supra CLI container is running!"
echo ""
echo "=========================================="
echo "  Next Steps"
echo "=========================================="
echo ""
echo "1. Enter the container shell:"
echo "   docker exec -it supra_cli /bin/bash"
echo ""
echo "2. Create a new Move package:"
echo "   supra move tool init --package-dir /supra/move_workspace/myProject --name myProject"
echo ""
echo "3. Create an account:"
echo "   supra key generate --key-type ed25519"
echo ""
echo "4. Fund your account (testnet):"
echo "   supra move account fund-with-faucet --rpc-url https://rpc-testnet.supra.com"
echo ""
echo "5. Deploy your contract:"
echo "   supra move tool publish --package-dir /supra/move_workspace/myProject --rpc-url https://rpc-testnet.supra.com"
echo ""
echo "📖 Docs: https://docs.supra.com"
echo "🔭 Explorer: https://suprascan.io"
