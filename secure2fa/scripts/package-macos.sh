#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${APP_BUNDLE:-secure2fa.app}"
APP_NAME="${APP_NAME:-Secure 2FA}"
MACOS_PLATFORM="${MACOS_PLATFORM:-darwin/$(go env GOARCH)}"
VERSION="${VERSION:-$(git -C "$ROOT_DIR" describe --tags --always --dirty 2>/dev/null || date +%Y%m%d%H%M%S)}"
SAFE_VERSION="$(printf '%s' "$VERSION" | tr -c '[:alnum:]._-+' '-')"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/build/release}"
STAGE_DIR="$DIST_DIR/stage"
WAILS_VERSION="${WAILS_VERSION:-v2.12.0}"

NOTARIZE="${NOTARIZE:-0}"
CREATE_DMG="${CREATE_DMG:-0}"
SIGN_IDENTITY="${SIGN_IDENTITY:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"
PACKAGE_KIND="unsigned"

if [[ -n "$SIGN_IDENTITY" ]]; then
  PACKAGE_KIND="signed"
fi

if [[ "$NOTARIZE" == "1" ]]; then
  PACKAGE_KIND="notarized"
fi

ZIP_PATH="$DIST_DIR/secure2fa-macos-${SAFE_VERSION}-${PACKAGE_KIND}.zip"
DMG_PATH="$DIST_DIR/secure2fa-macos-${SAFE_VERSION}-${PACKAGE_KIND}.dmg"

run_wails() {
  if command -v wails >/dev/null 2>&1; then
    wails "$@"
    return
  fi

  go run "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}" "$@"
}

require_notarization_inputs() {
  local missing=()

  [[ -n "$SIGN_IDENTITY" ]] || missing+=("SIGN_IDENTITY")
  [[ -n "$APPLE_ID" ]] || missing+=("APPLE_ID")
  [[ -n "$APPLE_TEAM_ID" ]] || missing+=("APPLE_TEAM_ID")
  [[ -n "$APPLE_APP_SPECIFIC_PASSWORD" ]] || missing+=("APPLE_APP_SPECIFIC_PASSWORD")

  if (( ${#missing[@]} > 0 )); then
    printf 'Missing required notarization env vars: %s\n' "${missing[*]}" >&2
    exit 1
  fi
}

create_zip() {
  local app_path="$1"
  local zip_path="$2"

  rm -f "$zip_path"
  ditto -c -k --norsrc --keepParent "$app_path" "$zip_path"
}

cd "$ROOT_DIR"

rm -rf "$DIST_DIR"
mkdir -p "$STAGE_DIR"

run_wails build -clean -skipbindings -platform "$MACOS_PLATFORM"

BUILT_APP_PATH="$ROOT_DIR/build/bin/$APP_BUNDLE"
DIST_APP_PATH="$DIST_DIR/$APP_BUNDLE"
STAGED_APP_PATH="$STAGE_DIR/$APP_BUNDLE"

if [[ ! -d "$BUILT_APP_PATH" ]]; then
  printf 'Expected app bundle not found: %s\n' "$BUILT_APP_PATH" >&2
  exit 1
fi

ditto "$BUILT_APP_PATH" "$DIST_APP_PATH"
ditto "$DIST_APP_PATH" "$STAGED_APP_PATH"

if [[ -n "$SIGN_IDENTITY" ]]; then
  codesign --force --options runtime --timestamp --deep --sign "$SIGN_IDENTITY" "$DIST_APP_PATH"
  rm -rf "$STAGED_APP_PATH"
  ditto "$DIST_APP_PATH" "$STAGED_APP_PATH"
else
  printf 'Skipping Developer ID signing because SIGN_IDENTITY is not set.\n'
fi

create_zip "$DIST_APP_PATH" "$ZIP_PATH"

if [[ "$NOTARIZE" == "1" ]]; then
  require_notarization_inputs

  xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait

  xcrun stapler staple "$DIST_APP_PATH"
  rm -rf "$STAGED_APP_PATH"
  ditto "$DIST_APP_PATH" "$STAGED_APP_PATH"
  create_zip "$DIST_APP_PATH" "$ZIP_PATH"
fi

if [[ "$CREATE_DMG" == "1" ]]; then
  rm -f "$DMG_PATH"
  hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE_DIR" -ov -format UDZO "$DMG_PATH"
fi

printf '\nArtifacts:\n'
printf '  %s\n' "$DIST_APP_PATH"
printf '  %s\n' "$ZIP_PATH"
if [[ "$CREATE_DMG" == "1" ]]; then
  printf '  %s\n' "$DMG_PATH"
fi
