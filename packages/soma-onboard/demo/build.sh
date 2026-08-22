#!/usr/bin/env bash
# Assemble a self-contained, deployable copy of the demo.
#
# The demo imports the engine with ordinary relative paths (`../src/config.js`)
# because it runs the *shipped* code rather than a bundled copy of it. So the
# published tree has to preserve that shape: index.html at the root, demo.js one
# level down, and src/ + client/ where the relative imports already point.
#
# No bundler on purpose — what gets deployed is byte-identical to what the tests
# run against.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg="$(dirname "$here")"
out="$here/dist"

rm -rf "$out"
mkdir -p "$out/demo"

cp "$here/index.html" "$out/index.html"
cp "$here/demo.js"    "$out/demo/demo.js"
cp -R "$pkg/src"      "$out/src"
cp -R "$pkg/client"   "$out/client"
rm -rf "$out/client/dist" "$out/demo/dist"

# index.html loads ./demo.js when served from demo/; from the root it is
# ./demo/demo.js. Rewrite that one reference rather than complicate the source.
sed -i '' 's|src="./demo.js"|src="./demo/demo.js"|' "$out/index.html"

cat > "$out/_headers" <<'EOF'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
EOF

echo "built → $out"
find "$out" -type f | sed "s|$out|  dist|" | sort
