#!/usr/bin/env bash
# deploy-guide.sh — prepare and verify soma-guide.netlify.app releases.
#
# soma-guide.netlify.app is git-linked to eldrgeek/soma-platform master.
# Pushing a commit to master deploys the committed dist/ directory. This script
# prepares dist/, can create a draft for consumer testing, and verifies the
# production CDN after push-to-deploy completes.
#
# What it does:
#   1. Builds soma-assist-core and syncs it plus the guide artifacts into dist/.
#   2. With --draft, deploys dist/ to a draft URL on the pinned live site.
#   3. With --verify-only, skips the build/sync/deploy and polls the production
#      CDN for the SOMA_GUIDE_VERSION committed in dist/.
#
# Usage:
#   scripts/deploy-guide.sh               # build + sync dist/; do not deploy
#   scripts/deploy-guide.sh --draft       # build + sync, then deploy a draft
#   scripts/deploy-guide.sh --dry-run     # build + sync + show release details
#   scripts/deploy-guide.sh --verify-only # only verify the production CDN
#
# Note: dist/ also carries artifacts NOT sourced from packages/soma-guide
# (soma-owner.js, soma-manager.js, soma-edit.js, iframe.html, ...). Those are
# edited in place or synced by hand; a draft includes whatever is in dist/.
set -euo pipefail

SITE_ID="be7dc842-106c-4aaa-8898-a46e36954b85"
SITE_NAME="soma-guide"
CDN_URL="https://soma-guide.netlify.app/soma-guide.js"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_DIR/packages/soma-guide"
CORE_DIR="$REPO_DIR/packages/soma-assist-core"
DIST_DIR="$REPO_DIR/dist"

MODE="sync"
case "${1:-}" in
  "") ;;
  --draft) MODE="draft" ;;
  --dry-run) MODE="dry-run" ;;
  --verify-only) MODE="verify" ;;
  *)
    echo "Usage: $0 [--draft|--dry-run|--verify-only]" >&2
    exit 2
    ;;
esac

if (( $# > 1 )); then
  echo "Usage: $0 [--draft|--dry-run|--verify-only]" >&2
  exit 2
fi

# --- 1. Build and sync engine files from packages to dist ---
if [[ "$MODE" != "verify" ]]; then
  npm --prefix "$CORE_DIR" run build
  for f in soma-guide.js soma-guide.css soma-guide-shim.js; do
    if ! diff -q "$PKG_DIR/$f" "$DIST_DIR/$f" >/dev/null 2>&1; then
      echo "sync: $f (packages/soma-guide -> dist)"
      cp "$PKG_DIR/$f" "$DIST_DIR/$f"
    fi
  done
  for f in soma-assist-core.js soma-assist-core.css; do
    if ! diff -q "$CORE_DIR/dist/$f" "$DIST_DIR/$f" >/dev/null 2>&1; then
      echo "sync: $f (packages/soma-assist-core -> dist)"
      cp "$CORE_DIR/dist/$f" "$DIST_DIR/$f"
    fi
  done
fi

# --- 2. Extract the version string we expect to see on the CDN ---
VERSION="$(grep -oE "SOMA_GUIDE_VERSION = '[^']+'" "$DIST_DIR/soma-guide.js" | head -1 | sed "s/.*'\(.*\)'/\1/")"
if [[ -z "$VERSION" ]]; then
  echo "FAIL: could not extract SOMA_GUIDE_VERSION from dist/soma-guide.js" >&2
  exit 1
fi

echo "site:    $SITE_NAME ($SITE_ID)"
echo "version: $VERSION"
echo "dir:     $DIST_DIR"

if [[ -n "$(git -C "$REPO_DIR" status --porcelain -- dist packages 2>/dev/null)" ]]; then
  echo "note: uncommitted changes in dist/ or packages/ — commit the intended dist/ artifacts before pushing."
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "dry-run: dist is synced; no draft deployed and no CDN verification run."
  exit 0
fi

# --- 3. Optionally deploy a draft (site pinned; cannot hit the wrong site) ---
if [[ "$MODE" == "draft" ]]; then
  NETLIFY="$(command -v netlify || true)"
  if [[ -z "$NETLIFY" ]]; then
    NETLIFY="$(ls -d "$HOME"/.nvm/versions/node/*/bin/netlify 2>/dev/null | sort -V | tail -1 || true)"
  fi
  if [[ -z "$NETLIFY" ]]; then
    echo "FAIL: netlify CLI not found on PATH or under ~/.nvm." >&2
    exit 1
  fi

  echo "deploying draft (the Netlify output below includes its draft URL) ..."
  "$NETLIFY" deploy --site="$SITE_ID" --dir="$DIST_DIR"
  echo "draft deployed; test the URL above against a real consumer page."
  exit 0
fi

if [[ "$MODE" == "sync" ]]; then
  echo "sync complete: commit dist/, push to master, then run $0 --verify-only."
  exit 0
fi

# --- 4. Verify the CDN is serving the committed version after push-to-deploy ---
# Cache-Control is max-age=300; a cache-buster query param forces a fresh
# object (Netlify keys its cache on the full URL). Browsers without the
# buster may still see the old JS for up to 5 min — that's expected.
BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
if [[ "$BRANCH" != "master" ]]; then
  echo "note: this checkout is on '$BRANCH', not master; the version checked is this checkout's, which may not be what master deployed."
fi
echo "verifying CDN serves version $VERSION ..."
DEADLINE=$((SECONDS + 130))
while (( SECONDS < DEADLINE )); do
  LIVE="$(curl -fsS "$CDN_URL?nocache=$(date +%s)" 2>/dev/null | grep -oE "SOMA_GUIDE_VERSION = '[^']+'" | head -1 | sed "s/.*'\(.*\)'/\1/" || true)"
  if [[ "$LIVE" == "$VERSION" ]]; then
    echo "OK: CDN is serving $VERSION."
    echo "(browsers may cache the old JS up to 5 min — hard-refresh to see it now)"
    exit 0
  fi
  echo "  cdn has '${LIVE:-<no response>}', want '$VERSION' — retrying in 10s"
  sleep 10
done

echo "FAIL: CDN never served $VERSION within ~2 min. The git-linked deploy may not have completed." >&2
echo "Check the Netlify deploy for site $SITE_ID." >&2
exit 1
