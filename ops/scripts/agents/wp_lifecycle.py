"""Exact-source work package policy, local/remote state resolution, and local-CI receipt verification for Orebit GeoAtlas."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

REPO = "ghoziankarami/orebit-geoatlas"
ORIGIN = f"https://github.com/{REPO}.git"
LEDGER = "ops/wp-claims"
PREFIX = "orebit-wp-v1\n"
RISKS = ("LOW", "MEDIUM", "HIGH", "RELEASE")
SCOPES = ("targeted", "browser", "full")
SHA = re.compile(r"[0-9a-f]{40}")

LOCAL_CI_REQUIRED_CHECKS = {
    "docs-guard",
    "plan-registry",
    "wp-policy",
    "reference-validate",
    "app-build",
}


def command(args, *, input=None, cwd=None, env=None, stream=False):
    run = subprocess.run(
        args,
        input=input,
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        capture_output=not stream,
        check=False,
    )
    if run.returncode:
        raise ValueError(
            f"{args[0]} {args[1]} failed ({run.returncode}): {(run.stderr or '').strip()}"
        )
    return (run.stdout or "").strip()


def git(*args, **kwargs):
    return command(["git", *args], **kwargs)


def _local_ci_candidates(root, source):
    root_path = Path(root)
    candidates = [root_path / ".tmp-tier-receipts" / f"local-ci-{source}.json"]
    try:
        common = git("rev-parse", "--git-common-dir", cwd=root_path)
        common_path = Path(common)
        if not common_path.is_absolute():
            common_path = (root_path / common_path).resolve()
        candidates.append(common_path / "orebit-local-ci" / f"local-ci-{source}.json")
    except ValueError:
        pass
    return candidates


def local_ci_receipt(root, source):
    """Validate an exact-SHA local CI receipt produced by ops/scripts/ci/local-ci.sh --full --write-receipt."""
    path = next((p for p in _local_ci_candidates(root, source) if p.is_file()), None)
    if path is None:
        raise ValueError(
            "Local CI receipt missing for exact head; run: "
            "bash ops/scripts/ci/local-ci.sh --full --write-receipt"
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Local CI receipt is malformed JSON.") from exc
    if not isinstance(data, dict) or not isinstance(data.get("checks"), list):
        raise ValueError("Local CI receipt has invalid structure.")
    if (
        data.get("schema") != "orebit-local-ci-v1"
        or data.get("commit") != source
        or data.get("status") != "passed"
        or data.get("clean") is not True
        or data.get("mode") != "full"
    ):
        raise ValueError("Local CI receipt must be a clean full pass for exact head.")
    checks = {c for c in data["checks"] if isinstance(c, str)}
    missing = sorted(LOCAL_CI_REQUIRED_CHECKS - checks)
    if missing:
        raise ValueError(
            f"Local CI receipt missing required checks: {', '.join(missing)}"
        )
    expected_digest = data.get("digest_sha256")
    body = {k: v for k, v in data.items() if k != "digest_sha256"}
    actual_digest = hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    if expected_digest != actual_digest:
        raise ValueError(
            "Local CI receipt digest mismatch; rerun local-ci.sh --full --write-receipt."
        )
    return data


def policy(wp, risk=None, scope=None):
    risk = risk or wp.risk
    scope = scope or wp.scope
    if RISKS.index(risk) < RISKS.index(wp.risk) or SCOPES.index(scope) < SCOPES.index(
        wp.scope
    ):
        raise ValueError("Risk and verification cannot fall below the WP registry.")
    if risk == "RELEASE":
        scope = "full"
    kinds = {"targeted"}
    if risk != "LOW":
        kinds.add("build")
    if risk in ("HIGH", "RELEASE"):
        kinds.add("regression")
    if scope == "browser":
        kinds.add("browser")
    if scope == "full":
        kinds.add("full")
    return risk, scope, risk in ("HIGH", "RELEASE"), kinds


def local_heads(root: Path) -> dict[str, str]:
    out = subprocess.run(
        ["git", "for-each-ref", "--format=%(objectname)\t%(refname:short)", "refs/heads/"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    heads = {}
    for line in out.stdout.splitlines():
        if "\t" in line:
            sha, ref = line.split("\t", 1)
            heads[ref] = sha
    return heads


def local_completions(root: Path, archived_task_ids: set[str], wps: list) -> dict[str, dict]:
    """Resolve completed WPs from the completion archive (`docs/geoatlas-completed.md`) and git merge history."""
    done: dict[str, dict] = {}
    main_sha = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    for w in wps:
        if w.closes and set(w.closes).issubset(archived_task_ids):
            done[w.id] = {
                "status": "MERGED",
                "source_sha": main_sha,
                "merge_sha": main_sha,
            }
    return done
