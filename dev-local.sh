#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/api"
APP_DIR="$ROOT_DIR/app"
DEFAULT_REMOTE_API="https://orange-bush-0dfb3ea1e.7.azurestaticapps.net/api"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${USE_REMOTE_API:-0}" == "1" ]]; then
  echo "Starting app only with remote API: $DEFAULT_REMOTE_API"
  cd "$APP_DIR"
  VITE_API_BASE_URL="$DEFAULT_REMOTE_API" npm run dev -- --host 0.0.0.0 --port 5173
  exit 0
fi

if ! command -v func >/dev/null 2>&1; then
  echo "Azure Functions Core Tools is required for full local API + app mode."
  echo "Install it on macOS with:"
  echo "  brew tap azure/functions"
  echo "  brew install azure-functions-core-tools@4"
  echo
  echo "Or run app-only against remote API with:"
  echo "  USE_REMOTE_API=1 bash dev-local.sh"
  exit 1
fi

if grep -q '"COSMOS_KEY": "replace-with-cosmos-primary-key"' "$API_DIR/local.settings.json"; then
  echo "Please set a real COSMOS_KEY in api/local.settings.json before local API start."
  exit 1
fi

echo "Starting local Azure Functions API on http://127.0.0.1:7071 ..."
cd "$API_DIR"
npm start &
API_PID=$!

echo "Starting app on http://127.0.0.1:5173 ..."
cd "$APP_DIR"
npm run dev -- --host 0.0.0.0 --port 5173
