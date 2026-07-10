#!/usr/bin/env bash
# deploy-guide.sh — THE deploy path for soma-guide.netlify.app.
#
# soma-guide.netlify.app is NOT linked to this repo in Netlify
# (build_settings.repo_url: None, verified 2026-07-03). git push does
# NOTHING to the CDN. This script is the only thing that ships.
#
# What it does:
#   1. Builds soma-assist-core and syncs it plus the guide artifacts into dist/.
#   2. Deploys dist/ to the soma-guide site with the site id HARDCODED,
#      so it can never cross-deploy to another site (same pattern as
#      legends-membership-site/scripts/deploy.sh).
#   3. Polls the CDN for the deployed SOMA_GUIDE_VERSION string and fails
#      loudly if it doesn't appear within ~2 minutes.
#
# Usage:
#   scripts/deploy-guide.sh            # sync, deploy, verify
#   scripts/deploy-guide.sh --dry-run  # sync + show site id/version; no deploy
#
# Note: dist/ also carries artifacts NOT sourced from packages/soma-guide
# (soma-owner.js, soma-manager.js, soma-edit.js, iframe.html, ...). Those are
# edited in place or synced by hand; this script deploys whatever is in dist/.
set -euo pipefail

SITE_ID="f549d1d9-b1d5-4995-92af-df78e5721c2a"
SITE_NAME="soma-guide"
CDN_URL="https://soma-guide.netlify.app/soma-guide.js"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_DIR/packages/soma-guide"
CORE_DIR="$REPO_DIR/packages/soma-assist-core"
DIST_DIR="$REPO_DIR/dist"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# --- Resolve netlify CLI (thin PATHs in dispatched shells miss nvm) ---
NETLIFY="$(command -v netlify || true)"
if [[ -z "$NETLIFY" ]]; then
  NETLIFY="$(ls -d "$HOME"/.nvm/versions/node/*/bin/netlify 2>/dev/null | sort -V | tail -1 || true)"
fi
if [[ -z "$NETLIFY" ]]; then
  echo "FAIL: netlify CLI not found on PATH or under ~/.nvm." >&2
  exit 1
fi

# --- 1. Build and sync engine files from packages to dist ---
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
  echo "note: uncommitted changes in dist/ or packages/ — remember to commit after deploying."
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "dry-run: skipping deploy + CDN verification."
  exit 0
fi

# --- 3. Deploy (site pinned; cannot hit the wrong site) ---
"$NETLIFY" deploy --prod --site="$SITE_ID" --dir="$DIST_DIR"

# --- 4. Verify the CDN is actually serving the new version ---
# Cache-Control is max-age=300; a cache-buster query param forces a fresh
# object (Netlify keys its cache on the full URL). Browsers without the
# buster may still see the old JS for up to 5 min — that's expected.
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

echo "FAIL: CDN never served $VERSION within ~2 min. Deploy may not have taken." >&2
echo "Check: $NETLIFY api getSite --data '{\"site_id\":\"$SITE_ID\"}' and the Netlify UI." >&2
exit 1
