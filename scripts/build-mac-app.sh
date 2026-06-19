#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/secure2fa"
APP_BUNDLE_NAME="${APP_BUNDLE_NAME:-secure2fa.app}"
APP_DISPLAY_NAME="${APP_DISPLAY_NAME:-secure2fa}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/builds}"
WAILS_VERSION="${WAILS_VERSION:-v2.12.0}"

run_wails() {
  if command -v wails >/dev/null 2>&1; then
    wails "$@"
    return
  fi
  go run "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}" "$@"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script only supports macOS." >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

cd "$APP_DIR"
run_wails build -clean -skipbindings -platform "darwin/$(go env GOARCH)"

BUILT_APP="$APP_DIR/build/bin/$APP_BUNDLE_NAME"
if [[ ! -d "$BUILT_APP" ]]; then
  echo "Build succeeded but app bundle not found: $BUILT_APP" >&2
  exit 1
fi

TARGET_APP="$OUTPUT_DIR/${APP_DISPLAY_NAME}.app"

rm -rf "$TARGET_APP"
ditto "$BUILT_APP" "$TARGET_APP"

echo "App bundle created: $TARGET_APP"
