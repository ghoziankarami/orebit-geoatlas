#!/usr/bin/env bash
# coverage.sh — ukur line coverage modul murni app (tes Node, tanpa DOM/browser).
# Mencetak tabel per modul lalu gagal bila total line coverage di bawah ambang.
#
# Usage:
#   bash ops/scripts/ci/coverage.sh [MIN_LINE_PCT]     (default 60)
set -euo pipefail

MIN="${1:-60}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BUILD=".cov/build"
rm -rf "$BUILD"
mkdir -p .cov

GEOATLAS_COMPILE_DIR="$BUILD" node --test \
  --experimental-test-coverage \
  --test-coverage-include="$BUILD/**" \
  --test-coverage-lines="$MIN" \
  tests/test_app_contracts.mjs
