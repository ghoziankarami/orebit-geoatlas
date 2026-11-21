"""Zero-LLM compact context packer, targeted test resolver, and parallel wave planner for Orebit GeoAtlas."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

INVARIANTS_DIGEST = (
    "NON-NEGOTIABLE REPO RULES (compact digest):\n"
    "1. Never bypass guards (`check-docs.py`, `check-plan-registry.py`, `wp.py check`), never weaken test assertions, never commit raw proprietary GeoMap SHP data.\n"
    "2. Stay strictly inside this WP's lane & scope. Do not touch unrelated files or other worktrees.\n"
    "3. Maintain full honesty of geological provenance (`confidence`: `curated` | `auto` | `flagged`); never disguise `[AUTO]` mappings as manual geological verification.\n"
    "4. Use Equal-Area projection (`EPSG:6933`) for polygon area calculations (`area_km2` and `MIN_AREA_M2 = 2000`) across multi-UTM-zone Indonesian regions.\n"
    "5. Enforce Zero-Overlap UI layout on desktop (1366x768: `.detail` and `#transectPanel` must sit below `.map-ctrls`, never colliding) and 3-snap-point sheet on mobile (375x812: `peek` retains `#searchInput` and `#regionBar`).\n"
    "6. Escape all external/GeoJSON/PMTiles/index strings via `esc()` before DOM injection; maintain 100% key parity between `id` and `en` in `app/src/i18n.ts`.\n"
    "7. Run `bash ops/scripts/ci/local-ci.sh --fast` + this WP's targeted tests before handoff.\n"
    "8. Close G8 (`docs/PLAN-geoatlas.md` -> `docs/geoatlas-completed.md` + single `## ACTIVE CHECKPOINT` in `docs/handover/HANDOVER-geoatlas.md`) in this WP branch when closing tasks.\n"
)


def extract_active_checkpoint(handover_path: Path) -> str:
    """Return ONLY the single top ACTIVE CHECKPOINT section."""
    if not handover_path.is_file():
        return "(handover file missing)"
    lines = handover_path.read_text(encoding="utf-8").splitlines()
    out = []
    started = False
    for line in lines:
        if line.startswith("## ACTIVE CHECKPOINT"):
            started = True
            out.append(line)
            continue
        if started and line.startswith("## "):
            break
        if started:
            out.append(line)
    return "\n".join(out).strip() or "(no ACTIVE CHECKPOINT found)"


def extract_task_details(tasks_path: Path, task_ids: list[str]) -> list[dict]:
    """Return ONLY the matching queue rows and `#rincian-<id>` cards from PLAN-geoatlas.md."""
    if not tasks_path.is_file() or not task_ids:
        return []
    text = tasks_path.read_text(encoding="utf-8")
    wanted = set(task_ids)
    rows: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"^\| ([A-Z][A-Z0-9-]+) \| P[0-2] \|", line)
        if m and m.group(1) in wanted:
            rows[m.group(1)] = line

    cards: dict[str, str] = {}
    for tid in task_ids:
        anchor = f'<a id="rincian-{tid.lower()}"></a>'
        idx = text.find(anchor)
        if idx == -1:
            continue
        end = text.find('<a id="rincian-', idx + len(anchor))
        snippet = text[idx : end if end != -1 else len(text)].strip()
        if len(snippet) > 3500:
            snippet = snippet[:3500].rstrip() + "\n... [truncated]"
        cards[tid] = snippet

    result = []
    for tid in task_ids:
        result.append(
            {
                "id": tid,
                "row": rows.get(tid, f"(task {tid} not in open table — check archive)"),
                "card": cards.get(tid, ""),
            }
        )
    return result


def _extract_tes_block(card_text: str) -> str:
    lines = card_text.splitlines()
    captured = []
    in_tes = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("**Tes:**"):
            in_tes = True
            captured.append(stripped.split("**Tes:**", 1)[1].strip())
            continue
        if in_tes:
            if not stripped or re.match(r"^\*\*[A-Za-z0-9_-]+.*:\*\*", stripped):
                break
            captured.append(stripped)
    return " ".join(captured).strip()


def resolve_card_tests(card_text: str, root: Path) -> dict:
    """Map `**Tes:**` entries from a WP card to bounded repo test files."""
    root_resolved = root.resolve()
    tes_line = _extract_tes_block(card_text)

    tokens = re.findall(
        r"[A-Za-z0-9_./-]+\.(?:py|mjs|js|sh)|test_[A-Za-z0-9_]+", tes_line
    )
    direct_files: list[str] = []
    seen_files: set[str] = set()
    search_roots = (
        root_resolved / "tests",
        root_resolved / "pipeline",
        root_resolved / "ops" / "scripts" / "guards",
        root_resolved / "ops" / "scripts" / "agents",
        root_resolved / "ops" / "scripts" / "ci",
        root_resolved,
    )
    for tok in tokens:
        if tok.startswith("/") or ".." in Path(tok).parts:
            continue
        candidates = []
        if "/" in tok or tok.endswith((".py", ".mjs", ".js", ".sh")):
            candidates.append(root_resolved / tok)
            candidates.append(root_resolved / "tests" / tok)
            candidates.append(root_resolved / "pipeline" / tok)
            candidates.append(root_resolved / "ops" / "scripts" / "guards" / tok)
        else:
            for base in search_roots:
                candidates.append(base / f"{tok}.py")
                candidates.append(base / f"{tok}.mjs")
        for cand in candidates:
            try:
                resolved = cand.resolve()
                rel = resolved.relative_to(root_resolved).as_posix()
            except ValueError:
                continue
            if resolved.is_file() and rel not in seen_files:
                seen_files.add(rel)
                direct_files.append(rel)
                break

    pr_suites = [rel for rel in direct_files if "browser" in rel]
    standalone_files = [rel for rel in direct_files if rel not in pr_suites]
    est_seconds = len(standalone_files) * 4 + len(pr_suites) * 20
    return {
        "raw_tes": tes_line,
        "direct_files": direct_files,
        "pr_suite_files": pr_suites,
        "standalone_files": standalone_files,
        "pr_suites": pr_suites,
        "quick_only_regex": "^(browser_uiux)$" if pr_suites else "",
        "estimated_seconds": est_seconds,
    }


def git_diff_stat(root: Path, base: str, head: str) -> str:
    if not base or not head or base.startswith("-") or head.startswith("-"):
        return "(invalid git ref)"
    try:
        out = subprocess.check_output(
            ["git", "-C", str(root), "diff", "--stat", f"{base}..{head}", "--"],
            text=True,
            encoding="utf-8",
            stderr=subprocess.DEVNULL,
        )
        return out.strip()
    except subprocess.CalledProcessError:
        return "(unable to compute diff stat locally — run git fetch)"


def build_brief(
    wp_obj,
    root: Path,
    *,
    role: str = "executor",
    base: str | None = None,
    head: str | None = None,
) -> dict:
    """Build a compact ~3-5 KB micro-brief for one WP."""
    handover = root / "docs" / "handover" / "HANDOVER-geoatlas.md"
    tasks_path = root / "docs" / "PLAN-geoatlas.md"
    checkpoint = extract_active_checkpoint(handover)
    tasks = extract_task_details(tasks_path, wp_obj.tasks)
    tests = resolve_card_tests(wp_obj.card, root)

    data = {
        "wp": wp_obj.id,
        "title": wp_obj.title,
        "role": role,
        "branch": wp_obj.branch,
        "lanes": list(wp_obj.lanes),
        "tasks": list(wp_obj.tasks),
        "closes": list(wp_obj.closes),
        "deps": list(wp_obj.deps),
        "risk": wp_obj.risk,
        "scope": wp_obj.scope,
        "exec_model": wp_obj.exec,
        "review_models": list(wp_obj.review),
        "start_gate": wp_obj.start,
        "checkpoint": checkpoint,
        "card": wp_obj.card.strip(),
        "task_details": tasks,
        "resolved_tests": tests,
        "invariants": INVARIANTS_DIGEST,
    }
    if role == "reviewer" and base and head:
        data["base"] = base
        data["head"] = head
        data["diff_stat"] = git_diff_stat(root, base, head)
    return data


def render_brief(data: dict) -> str:
    """Render compact markdown prompt ready for an executor or read-only reviewer subagent."""
    role = data["role"].upper()
    tests = data["resolved_tests"]
    browser_flag = " --browser" if tests["pr_suites"] else ""
    lines = [
        f"# {role} BRIEF — {data['wp']}: {data['title']}",
        f"Branch: `{data['branch']}` | Lane: `{'+'.join(data['lanes'])}` | Risk: `{data['risk']}/{data['scope']}` | Exec: `{data['exec_model']}` | Review: `{', '.join(data['review_models'])}`",
        f"Tasks: `{', '.join(data['tasks'])}` | Closes: `{', '.join(data['closes']) or 'none'}` | Deps: `{', '.join(data['deps']) or 'none'}`",
        "",
        data["invariants"].strip(),
        "",
        "## Active Checkpoint (top only)",
        data["checkpoint"],
        "",
        f"## WP Card ({data['wp']})",
        data["card"],
        "",
        "## Targeted Fast Verification",
        "- Fast local CI (~10s): `bash ops/scripts/ci/local-ci.sh --fast`",
    ]
    if tests["direct_files"]:
        lines.append(f"- Targeted test files: `{'`, `'.join(tests['direct_files'])}`")
    lines.append(
        "- Or run automatically: `python3 ops/scripts/agents/wp.py fast-test "
        f"{data['wp']}{browser_flag}`"
    )

    if data["task_details"]:
        lines.append("")
        lines.append("## Referenced TASKS Criteria")
        for item in data["task_details"]:
            lines.append(item["row"])
            if item["card"]:
                lines.append("")
                lines.append(item["card"])

    if role == "REVIEWER":
        lines.extend(
            [
                "",
                "## Read-Only Review Contract",
                "- Do NOT edit files, do NOT merge.",
                "- Inspect exact diff, DoD checklist, DOM escaping (`esc()`), i18n ID/EN parity, and local-ci/targeted test receipts.",
                "- Return strict verdict: `PASS` or `NEEDS_FIX` with actionable `file:line — issue — fix` items.",
            ]
        )
        if data.get("base") and data.get("head"):
            lines.append(f"- Exact range: `{data['base']}..{data['head']}`")
            lines.append("```")
            lines.append(data.get("diff_stat", ""))
            lines.append("```")

    return "\n".join(lines).strip() + "\n"


def plan_wave(
    wps: list,
    root: Path,
    *,
    max_parallel: int = 4,
    assume_merged: set[str] | None = None,
) -> dict:
    """Compute a parallel-safe wave of disjoint-lane WPs."""
    assumed = set(assume_merged or set())
    by_id = {w.id: w for w in wps}

    def is_done(wp_id: str) -> bool:
        return by_id[wp_id].state == "MERGED" or wp_id in assumed

    busy_lanes: set[str] = set()
    in_flight: list[str] = []
    for w in wps:
        if w.state in ("DIKERJAKAN", "REVIEW", "DIKLAIM") and w.id not in assumed:
            in_flight.append(w.id)
            for lane in w.lanes:
                if lane != "HUMAN":
                    busy_lanes.add(lane)

    selected = []
    used_lanes = set(busy_lanes)
    owner_gated = []
    blocked = []

    for w in wps:
        if is_done(w.id) or w.id in in_flight:
            continue
        missing_deps = [d for d in w.deps if not is_done(d)]
        if missing_deps:
            blocked.append({"wp": w.id, "waiting_on": missing_deps})
            continue
        if w.start.lower().startswith("pemilik") or w.gate == "manusia":
            owner_gated.append({"wp": w.id, "reason": w.start or "human gate"})
            continue
        clash = [lane for lane in w.lanes if lane in used_lanes and lane != "HUMAN"]
        if clash:
            blocked.append({"wp": w.id, "lane_busy": clash})
            continue
        if len(selected) >= max_parallel:
            continue
        tests = resolve_card_tests(w.card, root)
        selected.append(
            {
                "wp": w.id,
                "title": w.title,
                "branch": w.branch,
                "lanes": list(w.lanes),
                "exec": w.exec,
                "review": list(w.review),
                "targeted_suites": len(tests["direct_files"]),
                "targeted_est_seconds": tests["estimated_seconds"],
            }
        )
        for lane in w.lanes:
            if lane != "HUMAN":
                used_lanes.add(lane)

    return {
        "assumed_merged": sorted(assumed),
        "in_flight": in_flight,
        "selected_wave": selected,
        "owner_gated": owner_gated,
        "blocked_count": len(blocked),
    }
