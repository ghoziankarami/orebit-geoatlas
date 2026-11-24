#!/usr/bin/env python3
"""Cross-platform (Windows + macOS + Linux) local CI gate for Orebit GeoAtlas.

Usage:
  python3 ops/scripts/ci/local_ci.py [--fast|--full] [--write-receipt]
  py -3   ops/scripts/ci/local_ci.py [--fast|--full] [--write-receipt]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def git(root: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {(res.stderr or '').strip()}")
    return (res.stdout or "").strip()


def run_check(label: str, cmd: list[str], cwd: Path, passed: list[str]) -> None:
    t0 = time.monotonic()
    print(f"==> [{label}] ", end="", flush=True)
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    res = subprocess.run(
        cmd, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False
    )
    dt = int(time.monotonic() - t0)
    if res.returncode == 0:
        print(f"PASS ({dt}s)", flush=True)
        passed.append(label)
        return
    print(f"FAIL (rc={res.returncode})", flush=True)
    lines = ((res.stdout or "") + "\n" + (res.stderr or "")).strip().splitlines()
    for line in lines[-60:]:
        print(line, file=sys.stderr)
    sys.exit(res.returncode)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Portable local CI gate for Orebit GeoAtlas")
    ap.add_argument("--fast", action="store_const", const="fast", dest="mode")
    ap.add_argument("--full", action="store_const", const="full", dest="mode")
    ap.add_argument("--write-receipt", action="store_true")
    ap.set_defaults(mode="fast")
    args = ap.parse_args(argv)

    if args.write_receipt and args.mode != "full":
        print("ERROR: --write-receipt requires --full.", file=sys.stderr)
        return 2

    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel")).resolve()
    start_sha = git(root, "rev-parse", "HEAD")
    if args.write_receipt and git(root, "status", "--porcelain"):
        print("ERROR: cannot write local-ci receipt on a dirty working tree. Commit changes first.", file=sys.stderr)
        return 1

    py = sys.executable
    node_bin = shutil.which("node") or "node"
    npm_bin = shutil.which("npm.cmd" if sys.platform.startswith("win") else "npm") or "npm"
    started = time.monotonic()
    passed: list[str] = []

    run_check("docs-guard", [py, "ops/scripts/guards/check-docs.py"], root, passed)
    run_check("plan-registry", [py, "ops/scripts/guards/check-plan-registry.py"], root, passed)
    run_check("wp-policy", [py, "ops/scripts/agents/wp.py", "check"], root, passed)
    run_check("reference-validate", [py, "pipeline/validate_reference.py"], root, passed)
    if (root / "tests" / "test_pipeline_contracts.py").is_file():
        run_check("pipeline-contracts", [py, "tests/test_pipeline_contracts.py"], root, passed)
    if (root / "tests" / "test_prod_smoke.py").is_file():
        run_check("prod-smoke-unit", [py, "tests/test_prod_smoke.py"], root, passed)
    if (root / "tests" / "test_app_contracts.mjs").is_file():
        run_check("app-contracts", [node_bin, "tests/test_app_contracts.mjs"], root, passed)
        bash_bin = shutil.which("bash")
        if bash_bin and (root / "ops" / "scripts" / "ci" / "coverage.sh").is_file():
            run_check("coverage", [bash_bin, "ops/scripts/ci/coverage.sh", "60"], root, passed)
    run_check("app-build", [npm_bin, "--prefix", "app", "run", "build"], root, passed)

    if args.mode == "full":
        for label, script in (
            ("browser-uiux", "tests/test_browser_uiux.py"),
            ("pwa-install-browser", "tests/test_pwa_install_browser.py"),
            ("offline-geology-browser", "tests/test_offline_geology_browser.py"),
        ):
            if (root / script).is_file():
                run_check(label, [py, script], root, passed)

    duration = int(time.monotonic() - started)
    end_sha = git(root, "rev-parse", "HEAD")
    if args.write_receipt:
        if start_sha != end_sha or git(root, "status", "--porcelain"):
            print("ERROR: checkout changed during local-ci run; refusing to write receipt.", file=sys.stderr)
            return 1
        rdir = root / ".tmp-tier-receipts"
        rdir.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema": "orebit-local-ci-v1",
            "repo": "ghoziankarami/orebit-geoatlas",
            "commit": end_sha,
            "mode": args.mode,
            "status": "passed",
            "clean": True,
            "duration_seconds": duration,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": passed,
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")
        ).hexdigest()
        payload["digest_sha256"] = digest
        out_path = rdir / f"local-ci-{end_sha}.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Receipt written: {out_path} (sha256={digest[:16]}...)")

    print(f"local-ci ({args.mode}): PASS in {duration}s ({len(passed)} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
