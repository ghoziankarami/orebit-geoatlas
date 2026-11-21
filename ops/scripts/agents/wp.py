#!/usr/bin/env python3
"""Work package registry, wave planner, micro-brief packer, and verification CLI for Orebit GeoAtlas."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import wp_brief
import wp_lifecycle as lifecycle
import wp_wave

ROOT = Path(__file__).resolve().parents[3]
WP_DOC = ROOT / "docs" / "handover" / "WORK-PACKAGES-geoatlas.md"
TASKS = ROOT / "docs" / "PLAN-geoatlas.md"
ARCHIVE = ROOT / "docs" / "geoatlas-completed.md"
STANDARD = "docs/runbooks/agent-work-packages.md"
BEGIN, END = "<!-- BEGIN wp-registry -->", "<!-- END wp-registry -->"

MODELS = {
    "gpt-luna-6": 1,
    "deepseek-flash": 1,
    "claude-sonnet-5-5": 2,
    "claude-opus-5-5": 3,
    "gpt-sol-6-1": 3,
    "pemilik": 0,
    "manusia": 0,
}
LANES = {
    "DATA",
    "PIPE",
    "SEARCH",
    "MAP",
    "UIX",
    "TOOLS",
    "TEST",
    "DOCS",
    "REL",
    "HUMAN",
}
GATES = {"G3", "G4", "G6", "G4+G6", "manusia"}
CARD_LABELS = (
    "**Tujuan:**",
    "**Lingkup file:**",
    "**Langkah:**",
    "**Selesai bila (DoD):**",
    "**Tes:**",
    "**STOP-TANYA:**",
)
WP_ID = re.compile(r"^WP-\d{2}$")
COLUMNS = (
    "WP",
    "Judul",
    "Branch",
    "Lane",
    "Tugas",
    "Menutup",
    "Bergantung",
    "Gerbang",
    "Exec",
    "Review",
    "Mulai bila",
    "Risk",
    "Verification",
)


@dataclass
class WP:
    id: str
    title: str
    branch: str
    lanes: list
    tasks: list
    closes: list
    deps: list
    gate: str
    exec: str
    review: list
    start: str
    line: int
    risk: str = "HIGH"
    scope: str = "full"
    card: str = ""
    state: str = ""
    pr: dict = field(default_factory=dict)


def split_list(cell: str) -> list:
    cell = cell.strip().strip("`")
    if cell in ("", "—", "-"):
        return []
    return [x.strip().strip("`") for x in re.split(r"[,+]", cell) if x.strip()]


def parse(doc: Path = WP_DOC) -> tuple:
    problems: list = []
    if not doc.exists():
        return [], [f"{doc.relative_to(ROOT).as_posix()} missing"]
    text = doc.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        return [], [f"registry markers {BEGIN} … {END} missing"]
    head, rest = text.split(BEGIN, 1)
    block, tail = rest.split(END, 1)
    base = head.count("\n") + 1
    wps: list = []
    header_seen = False
    for off, raw in enumerate(block.splitlines()):
        line = raw.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not header_seen:
            header_seen = True
            if tuple(cells) != COLUMNS:
                problems.append(f"registry header must be: | {' | '.join(COLUMNS)} |")
                return [], problems
            continue
        if set(line.replace("|", "").strip()) <= set("-: "):
            continue
        if len(cells) != len(COLUMNS):
            problems.append(
                f"line {base + off}: {len(cells)} cells, expected {len(COLUMNS)}"
            )
            continue
        c = dict(zip(COLUMNS, cells))
        wps.append(
            WP(
                id=c["WP"],
                title=c["Judul"],
                branch=c["Branch"].strip("`"),
                lanes=split_list(c["Lane"]),
                tasks=split_list(c["Tugas"]),
                closes=split_list(c["Menutup"]),
                deps=split_list(c["Bergantung"]),
                gate=c["Gerbang"],
                exec=c["Exec"].strip("`"),
                review=split_list(c["Review"]),
                start=c["Mulai bila"],
                line=base + off,
                risk=c["Risk"],
                scope=c["Verification"],
            )
        )
    cards = re.split(r"^### (WP-\d{2})\b.*$", tail, flags=re.MULTILINE)
    by_card = {cards[i]: cards[i + 1] for i in range(1, len(cards) - 1, 2)}
    for w in wps:
        w.card = by_card.get(w.id, "")
    return wps, problems


def task_ids(path: Path) -> set:
    if not path.exists():
        return set()
    return task_rows(path.read_text(encoding="utf-8"))


def task_rows(content: str) -> set:
    row = re.compile(r"^\| ([A-Z][A-Z0-9-]+) \| P[0-2] \|")
    return {m.group(1) for line in content.splitlines() if (m := row.match(line))}


def check(wps: list, problems: list) -> list:
    ids = [w.id for w in wps]
    known = set(ids)
    open_tasks = task_ids(TASKS)
    archived = task_ids(ARCHIVE)
    seen_branch: dict = {}
    closers: dict = {}
    for w in wps:
        at = f"{w.id} (line {w.line})"
        if not WP_ID.match(w.id):
            problems.append(f"{at}: id must look like WP-07")
        if ids.count(w.id) > 1:
            problems.append(f"{at}: duplicate id")
        if not re.match(r"^[a-z]+/[a-z0-9][a-z0-9.-]*$", w.branch):
            problems.append(f"{at}: branch '{w.branch}' must be <type>/<slug>")
        if w.branch in seen_branch:
            problems.append(f"{at}: branch shared with {seen_branch[w.branch]}")
        seen_branch[w.branch] = w.id
        for lane in w.lanes or ["(none)"]:
            if lane not in LANES:
                problems.append(f"{at}: lane '{lane}' not in {sorted(LANES)}")
        if w.gate not in GATES:
            problems.append(f"{at}: gate '{w.gate}' not in {sorted(GATES)}")
        if w.risk not in lifecycle.RISKS or w.scope not in lifecycle.SCOPES:
            problems.append(f"{at}: invalid risk or verification scope")
        elif w.risk == "RELEASE" and (w.scope != "full" or "pemilik" not in w.review):
            problems.append(
                f"{at}: release requires full verification and owner review"
            )
        if not w.review:
            problems.append(f"{at}: an independent reviewer is required")
        for m in [w.exec] + w.review:
            if m not in MODELS:
                problems.append(f"{at}: model '{m}' not in {sorted(MODELS)}")
        if MODELS.get(w.exec, 0) >= 2 and "**Alasan model mahal:**" not in w.card:
            problems.append(
                f"{at}: exec {w.exec} is T{MODELS[w.exec]}; card needs **Alasan model mahal:**"
            )
        if w.review and MODELS.get(w.review[0], 0) and w.review[0] == w.exec:
            problems.append(f"{at}: reviewer must differ from the exec model")
        for d in w.deps:
            if d not in known:
                problems.append(f"{at}: depends on unknown {d}")
            elif ids.index(d) >= ids.index(w.id):
                problems.append(
                    f"{at}: depends on {d}, which is listed later (registry order is execution order)"
                )
        if not w.tasks:
            problems.append(f"{at}: lists no TASKS IDs")
        for t in w.tasks + w.closes:
            if t not in open_tasks and t not in archived:
                problems.append(
                    f"{at}: task {t} is neither open in TASKS nor DONE in the archive"
                )
        for t in w.closes:
            if t not in w.tasks:
                problems.append(f"{at}: closes {t} but does not list it under Tugas")
            closers.setdefault(t, []).append(w.id)
        if not w.card:
            problems.append(f"{at}: no '### {w.id} — …' card below the registry")
        else:
            for label in CARD_LABELS:
                if label not in w.card:
                    problems.append(f"{at}: card lacks {label}")
            if w.branch not in w.card:
                problems.append(f"{at}: card does not name its branch `{w.branch}`")
    covered = {t for w in wps for t in w.tasks}
    for t in sorted(open_tasks - covered):
        problems.append(f"open TASKS row {t} is in no work package")
    for t in sorted(open_tasks):
        n = closers.get(t, [])
        if len(n) != 1:
            problems.append(
                f"open TASKS row {t} must be closed by exactly one WP (found {n or 'none'})"
            )
    return problems


def derive(wps, prs, heads, finished):
    by_id = {w.id: w for w in wps}
    busy = {}
    for w in wps:
        w.pr = prs.get(w.branch, {})
        w.state = ""
        state = w.pr.get("state")
        if w.id in finished or state == "MERGED":
            w.state = "MERGED"
        elif state == "OPEN":
            w.state = "DIKERJAKAN" if w.pr.get("isDraft") else "REVIEW"
        elif w.branch in heads:
            w.state = "DIKLAIM"
        if w.state in ("DIKERJAKAN", "REVIEW", "DIKLAIM"):
            for lane in w.lanes:
                busy.setdefault(lane, w.id)
    for w in wps:
        if w.state:
            continue
        waiting = [d for d in w.deps if by_id[d].state != "MERGED"]
        clash = [busy[lane] for lane in w.lanes if lane in busy and lane != "HUMAN"]
        if waiting:
            w.state = "MENUNGGU " + ",".join(waiting)
        elif clash:
            w.state = "ANTRE-LANE " + ",".join(sorted(set(clash)))
        elif w.start.lower().startswith("pemilik") or w.gate == "manusia":
            w.state = "PERLU-PEMILIK"
        else:
            w.state = "SIAP"


def live(wps):
    heads = lifecycle.local_heads(ROOT)
    archived = task_ids(ARCHIVE)
    finished = lifecycle.local_completions(ROOT, archived, wps)
    derive(wps, {}, heads, finished)
    return heads, {}, finished


def eligible(wps, exec_model, no_tier):
    return [
        w
        for w in wps
        if w.state == "SIAP"
        and (
            not exec_model
            or w.exec == exec_model
            or (MODELS.get(exec_model) == 1 and MODELS.get(w.exec) == 1)
        )
        and (not no_tier or w.scope != "full")
    ]


def cmd_status(wps: list) -> int:
    _, _, finished = live(wps)
    width = max(len(w.state) for w in wps)
    for w in wps:
        pr = (
            f"#{w.pr['number']}"
            if w.pr
            else finished.get(w.id, {}).get("merge_sha", "")[:10]
        )
        print(
            f"{w.id}  {w.state:<{width}}  {'+'.join(w.lanes):<14} {w.risk}/{w.scope:<8} "
            f"{w.exec:<16} {pr:<10} {w.title}"
        )
    return 0


def cmd_next(wps: list, exec_model: str, no_tier: bool) -> int:
    live(wps)
    ready = eligible(wps, exec_model, no_tier)
    if not ready:
        print("No ready work package for this filter. Run `status` to see what blocks.")
        return 0
    for w in ready:
        print(
            f"{w.id}  {w.branch}  lane={'+'.join(w.lanes)}  risk={w.risk}/{w.scope}  exec={w.exec}  — {w.title}"
        )
    return 0


PY = "python" if sys.platform.startswith("win") else "python3"
CLI = f"{PY} ops/scripts/agents/wp.py"
READ = f"PIPELINE.md, AGENTS.md, CLAUDE.md, {STANDARD}"


def cmd_prompt(w: WP) -> int:
    risk, scope, _, kinds = lifecycle.policy(w)
    print(f"""PELAKSANA {w.id} — {w.title}
Baca {READ}, kartu {w.id} di {WP_DOC.relative_to(ROOT).as_posix()},
TASKS {", ".join(w.tasks)}, dan ACTIVE CHECKPOINT.
Atau gunakan micro-brief hemat token: `{CLI} brief {w.id} --role executor`
Risk: {risk}/{scope} · Lane: {", ".join(w.lanes)} · Branch: `{w.branch}`
Eksekutor: `{w.exec}` · Reviewer Independen: `{", ".join(w.review)}`
Verifikasi wajib: `bash ops/scripts/ci/local-ci.sh --fast` dan `{CLI} fast-test {w.id}` (kategori: {", ".join(sorted(kinds))}).
Tutup G8 (pindahkan baris TASKS selesai ke {ARCHIVE.relative_to(ROOT).as_posix()} dan perbarui ACTIVE CHECKPOINT) sebelum review.""")
    return 0


def main(argv: list) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    sub.add_parser("status")
    nx = sub.add_parser("next")
    nx.add_argument("--exec", default="", help="model alias of this session")
    nx.add_argument(
        "--no-tier", action="store_true", help="this device cannot run the browser tier"
    )
    pr = sub.add_parser("prompt")
    pr.add_argument("wp")
    br = sub.add_parser(
        "brief", help="pack a compact ~4 KB micro-brief for one WP (saves >90%% tokens)"
    )
    br.add_argument("wp")
    br.add_argument("--role", choices=("executor", "reviewer"), default="executor")
    br.add_argument("--base", default=None)
    br.add_argument("--head", default=None)
    br.add_argument("--json", action="store_true", dest="as_json")
    wv = sub.add_parser(
        "wave", help="plan the next parallel-safe wave of disjoint-lane WPs"
    )
    wv.add_argument("--max", type=int, default=4, dest="max_parallel")
    wv.add_argument("--after-open", action="store_true")
    wv.add_argument("--json", action="store_true", dest="as_json")
    ft = sub.add_parser(
        "fast-test",
        help="run ONLY the targeted tests named in a WP card",
    )
    ft.add_argument("wp")
    ft.add_argument("--list", action="store_true", dest="list_only")
    ft.add_argument("--browser", action="store_true")
    ft.add_argument("--with-ci", action="store_true")
    wf = sub.add_parser(
        "workflow",
        help="generate a self-contained Antigravity run_workflow script for parallel WPs",
    )
    wf.add_argument("wps", nargs="+", help="disjoint-lane WP IDs, e.g. WP-01 WP-02 WP-03 WP-04")
    wf.add_argument("--exec-model", default="flash")
    wf.add_argument("--review-model", default="pro")
    wf.add_argument("--max-cycles", type=int, default=2)
    wf.add_argument("--base", default="main")

    args = ap.parse_args(argv)
    wps, problems = parse()
    problems = check(wps, problems)
    if args.cmd == "check" or problems:
        for p in problems:
            print(f"✗ {p}", file=sys.stderr)
        if problems:
            print(
                f"work packages: {len(problems)} problem(s); see {STANDARD}",
                file=sys.stderr,
            )
            return 1
        print(
            f"work packages: OK ({len(wps)} WP, every open TASKS row covered and closed once)"
        )
        return 0
    try:
        if args.cmd == "prompt":
            ref = args.wp.upper()
            w = next((item for item in wps if item.id == ref), None)
            if w is None:
                raise ValueError(f"Unknown WP {ref}")
            return cmd_prompt(w)
        if args.cmd == "brief":
            ref = args.wp.upper()
            w = next((item for item in wps if item.id == ref), None)
            if w is None:
                raise ValueError(f"Unknown WP {ref}")
            data = wp_brief.build_brief(
                w, ROOT, role=args.role, base=args.base, head=args.head
            )
            if args.as_json:
                print(json.dumps(data, ensure_ascii=False, indent=2))
            else:
                print(wp_brief.render_brief(data), end="")
            return 0
        if args.cmd == "fast-test":
            ref = args.wp.upper()
            w = next((item for item in wps if item.id == ref), None)
            if w is None:
                raise ValueError(f"Unknown WP {ref}")
            resolved = wp_brief.resolve_card_tests(w.card, ROOT)
            if args.list_only:
                print(json.dumps(resolved, ensure_ascii=False, indent=2))
                return 0
            if args.with_ci:
                rc = subprocess.run(
                    ["bash", str(ROOT / "ops/scripts/ci/local-ci.sh"), "--fast"],
                    cwd=ROOT,
                    check=False,
                ).returncode
                if rc:
                    return rc
            files_to_run = list(resolved["standalone_files"])
            if args.browser:
                files_to_run.extend(resolved["pr_suites"])
            for rel in files_to_run:
                cmd = (
                    ["node", rel]
                    if rel.endswith((".mjs", ".js"))
                    else ["bash", rel]
                    if rel.endswith(".sh")
                    else [sys.executable, rel]
                )
                rc = subprocess.run(cmd, cwd=ROOT, check=False).returncode
                if rc:
                    return rc
            return 0
        if args.cmd == "workflow":
            wanted = [item.upper() for item in args.wps]
            wp_wave.validate_workflow_args(
                wanted,
                exec_model=args.exec_model,
                review_model=args.review_model,
                max_cycles=args.max_cycles,
            )
            by_id = {item.id: item for item in wps}
            lanes_map = {}
            for wp_id in wanted:
                if wp_id not in by_id:
                    raise ValueError(f"Unknown WP {wp_id}")
                lanes_map[wp_id] = list(by_id[wp_id].lanes)
            conflicts = wp_wave.validate_wave_lanes(lanes_map)
            if conflicts:
                raise ValueError("; ".join(conflicts))
            print(
                wp_wave.render_antigravity_workflow(
                    wanted,
                    exec_model=args.exec_model,
                    review_model=args.review_model,
                    max_cycles=args.max_cycles,
                    base_ref=args.base,
                )
            )
            return 0
        if args.cmd == "wave":
            live(wps)
            current = wp_brief.plan_wave(wps, ROOT, max_parallel=args.max_parallel)
            out = {"current": current}
            if args.as_json:
                print(json.dumps(out, ensure_ascii=False, indent=2))
            else:
                for label, plan in out.items():
                    print(f"=== WAVE: {label} ===")
                    if not plan["selected_wave"]:
                        print("  (no ready parallel WPs)")
                    for item in plan["selected_wave"]:
                        print(
                            f"  {item['wp']}  lane={'+'.join(item['lanes']):<12} "
                            f"targeted={item['targeted_suites']} (~{item['targeted_est_seconds']}s)  "
                            f"{item['branch']} — {item['title']}"
                        )
                    if plan["owner_gated"]:
                        gates = ", ".join(g["wp"] for g in plan["owner_gated"])
                        print(f"  Owner-gated: {gates}")
            return 0
        if args.cmd == "status":
            return cmd_status(wps)
        if args.cmd == "next":
            return cmd_next(wps, args.exec, args.no_tier)
        return 0
    except (ValueError, OSError, KeyError) as exc:
        print(f"WP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
