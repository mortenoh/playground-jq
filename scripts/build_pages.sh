#!/usr/bin/env bash
# Build the static (GitHub Pages) app into <out>/playground-jq: jq runs in the browser as
# WebAssembly and every API answer is an exported JSON file.
set -euo pipefail
out="${1:-build/pages}"
base="${PJQ_BASE:-/playground-jq/}"
root="$(cd "$(dirname "$0")/.." && pwd)"
site="$out${base%/}"
rm -rf "$out"
mkdir -p "$site"
site="$(cd "$site" && pwd)"
cd "$root/frontend"
PJQ_BASE="$base" VITE_PJQ_STATIC=1 bunx tsc -b
PJQ_BASE="$base" VITE_PJQ_STATIC=1 bunx vite build --outDir "$site" --emptyOutDir
cd "$root"
uv run python scripts/export_static.py "$site"
# GitHub Pages answers unknown paths with 404.html; the app routes them itself.
cp "$site/index.html" "$site/404.html"
touch "$out/.nojekyll"
echo "built $site"
