#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Found: $(node --version)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

echo "[1/4] Installing dependencies..."
npm install

echo "[2/4] Installing Playwright Chromium..."
npx playwright install chromium

echo "[3/4] Building..."
npm run build

echo "[4/4] Installing command..."
if npm install --global "$ROOT"; then
  :
else
  USER_PREFIX="${AGENT_WEBUI_RELAY_PREFIX:-$HOME/.local}"
  echo "Global npm install was not writable; installing under $USER_PREFIX instead." >&2
  npm install --global --prefix "$USER_PREFIX" "$ROOT"
  case ":$PATH:" in
    *":$USER_PREFIX/bin:"*) ;;
    *)
      echo "Add this to your shell profile to use the command everywhere:" >&2
      echo "  export PATH=\"$USER_PREFIX/bin:\$PATH\"" >&2
      ;;
  esac
fi

echo
echo "Installed agent-webui-relay (alias: awr)."
echo "Next: agent-webui-relay login"
