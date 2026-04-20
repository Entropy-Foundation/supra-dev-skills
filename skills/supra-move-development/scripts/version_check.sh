#!/bin/bash
# ============================================================
# Supra Version Check Script
# Checks all required tools and their versions
# ============================================================

echo "=========================================="
echo "  Supra Dev Environment Version Check"
echo "=========================================="
echo ""

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VER=$(docker --version)
    echo "✅ Docker     : $DOCKER_VER"
else
    echo "❌ Docker     : NOT INSTALLED"
    echo "   Install from: https://www.docker.com/"
fi

# Check Docker Daemon
if docker info &> /dev/null 2>&1; then
    echo "✅ Docker Daemon: Running"
else
    echo "⚠️  Docker Daemon: NOT RUNNING — start Docker Desktop"
fi

# Check Supra CLI (inside container)
if docker ps --filter "name=supra_cli" --filter "status=running" | grep supra_cli &> /dev/null; then
    echo "✅ Supra CLI Container: Running"
    SUPRA_VER=$(docker exec supra_cli supra --version 2>/dev/null || echo "unknown")
    echo "✅ Supra CLI  : $SUPRA_VER"
else
    echo "❌ Supra CLI Container: NOT RUNNING"
    echo "   Run: curl https://raw.githubusercontent.com/supra-labs/supra-dev-hub/refs/heads/main/Scripts/cli/compose.yaml | docker compose -f - up -d"
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VER=$(node --version)
    echo "✅ Node.js    : $NODE_VER"
else
    echo "❌ Node.js    : NOT INSTALLED"
    echo "   Install: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VER=$(npm --version)
    echo "✅ npm        : v$NPM_VER"
else
    echo "❌ npm        : NOT INSTALLED"
fi

# Check Claude Code
if command -v claude &> /dev/null; then
    CLAUDE_VER=$(claude --version 2>/dev/null || echo "installed")
    echo "✅ Claude Code: $CLAUDE_VER"
else
    echo "❌ Claude Code: NOT INSTALLED"
    echo "   Install: npm install -g @anthropic-ai/claude-code"
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VER=$(git --version)
    echo "✅ Git        : $GIT_VER"
else
    echo "❌ Git        : NOT INSTALLED"
    echo "   Install: sudo apt-get install git -y"
fi

# Check API Key
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "✅ ANTHROPIC_API_KEY: Set ✓"
else
    echo "❌ ANTHROPIC_API_KEY: NOT SET"
    echo "   Run: export ANTHROPIC_API_KEY='your-key-here'"
fi

echo ""
echo "=========================================="
echo "  Network Check"
echo "=========================================="

# Check testnet connectivity
if curl -s --max-time 5 https://rpc-testnet.supra.com > /dev/null; then
    echo "✅ Supra Testnet: Reachable"
else
    echo "❌ Supra Testnet: NOT REACHABLE"
fi

echo ""
echo "✅ Version check complete!"
