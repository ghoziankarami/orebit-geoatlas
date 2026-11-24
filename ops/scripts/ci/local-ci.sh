#!/usr/bin/env bash
# local-ci.sh — Zero-GitHub-Actions local CI gate for Orebit GeoAtlas.
# Runs governance guards, reference validation, pipeline & app contract tests,
# production Vite+TS build, and (in --full mode) Playwright browser E2E checks.
# Writes an exact-SHA receipt when --full --write-receipt is passed.
#
# Usage:
#   bash ops/scripts/ci/local-ci.sh [--fast|--full] [--write-receipt]
set -euo pipefail

MODE="fast"
WRITE_RECEIPT=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --fast) MODE="fast"; shift ;;
    --full) MODE="full"; shift ;;
    --write-receipt) WRITE_RECEIPT=1; shift ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "FATAL: unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [ "$WRITE_RECEIPT" -eq 1 ] && [ "$MODE" != "full" ]; then
  echo "ERROR: --write-receipt requires --full." >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

START_SHA="$(git rev-parse HEAD)"
if [ "$WRITE_RECEIPT" -eq 1 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: cannot write local-ci receipt on a dirty working tree. Commit changes first." >&2
  exit 1
fi

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

STARTED="$(date +%s)"
PASSED_CHECKS=()

run_check() {
  local label="$1"
  shift
  local step_log="$LOG_DIR/${label}.log"
  local t0
  t0="$(date +%s)"
  printf '==> [%s] ' "$label"
  if "$@" >"$step_log" 2>&1; then
    local dt=$(( $(date +%s) - t0 ))
    printf 'PASS (%ss)\n' "$dt"
    PASSED_CHECKS+=("$label")
  else
    local rc=$?
    printf 'FAIL (rc=%s)\n' "$rc"
    tail -n 60 "$step_log" >&2 || true
    exit "$rc"
  fi
}

# 1. Governance & documentation guards
run_check "docs-guard" python3 ops/scripts/guards/check-docs.py
run_check "plan-registry" python3 ops/scripts/guards/check-plan-registry.py
run_check "wp-policy" python3 ops/scripts/agents/wp.py check

# 2. Geological reference validation
run_check "reference-validate" python3 pipeline/validate_reference.py

# 3. Pipeline & App unit/contract tests (run if present)
if [ -f "tests/test_pipeline_contracts.py" ]; then
  run_check "pipeline-contracts" python3 tests/test_pipeline_contracts.py
fi
if [ -f "tests/test_prod_smoke.py" ]; then
  run_check "prod-smoke-unit" python3 tests/test_prod_smoke.py
fi
if [ -f "tests/test_app_contracts.mjs" ]; then
  run_check "app-contracts" node tests/test_app_contracts.mjs
  # Coverage modul murni app: total line coverage wajib >= 60% (TEST-04 / WP-32)
  run_check "coverage" bash ops/scripts/ci/coverage.sh 60
fi

# 4. Production TypeScript & Vite build
run_check "app-build" npm --prefix app run build

# 5. Full browser E2E Playwright suite (in --full mode when present)
if [ "$MODE" = "full" ]; then
  if [ -f "tests/test_browser_uiux.py" ]; then
    run_check "browser-uiux" python3 tests/test_browser_uiux.py
  fi
  if [ -f "tests/test_pwa_install_browser.py" ]; then
    run_check "pwa-install-browser" python3 tests/test_pwa_install_browser.py
  fi
  if [ -f "tests/test_offline_geology_browser.py" ]; then
    run_check "offline-geology-browser" python3 tests/test_offline_geology_browser.py
  fi
fi

DURATION=$(( $(date +%s) - STARTED ))
END_SHA="$(git rev-parse HEAD)"

if [ "$WRITE_RECEIPT" -eq 1 ]; then
  if [ "$START_SHA" != "$END_SHA" ] || [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: checkout changed during local-ci run; refusing to write receipt." >&2
    exit 1
  fi
  mkdir -p "$ROOT/.tmp-tier-receipts"
  RECEIPT_PATH="$ROOT/.tmp-tier-receipts/local-ci-${END_SHA}.json"
  CHECKS_CSV="$(IFS=,; echo "${PASSED_CHECKS[*]}")"
  python3 - "$RECEIPT_PATH" "$END_SHA" "$MODE" "$DURATION" "$CHECKS_CSV" <<'PY'
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

out_path = Path(sys.argv[1])
commit = sys.argv[2]
mode = sys.argv[3]
duration = int(sys.argv[4])
checks = [c for c in sys.argv[5].split(",") if c]

payload = {
    "schema": "orebit-local-ci-v1",
    "repo": "ghoziankarami/orebit-geoatlas",
    "commit": commit,
    "mode": mode,
    "status": "passed",
    "clean": True,
    "duration_seconds": duration,
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
}
digest = hashlib.sha256(
    json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")
).hexdigest()
payload["digest_sha256"] = digest
out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"Receipt written: {out_path} (sha256={digest[:16]}...)")
PY
fi

echo "local-ci ($MODE): PASS in ${DURATION}s (${#PASSED_CHECKS[@]} checks)"
