#!/usr/bin/env python3
"""Every file under docs/ is registered, in the right place, and its links resolve.

Contract (docs/README.md, section "Registry dokumen"):
  1. The `docs-registry` table lists every docs path: a file, or a folder ending
     in `/` that covers everything below it. Each file under docs/ is covered by
     exactly one entry (the most specific one); each entry exists.
  2. Class is one of: operasional, rencana, log, desain, bukti, sumber, generated.
     Files directly in docs/ and in docs/{handover,runbooks,plans}/ must
     be registered one by one, so a new instruction cannot hide under a folder.
  3. Relative links in operasional/rencana/desain markdown resolve to an
     existing file (anchors are not checked). bukti/log are historical and may
     cite files that now live only in Git history.
  4. Exactly one `## ACTIVE CHECKPOINT` heading across docs/handover/.

Static, stdlib only. Exit 0 clean, 1 on violations.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
README = ROOT / "docs" / "README.md"
BEGIN, END = "<!-- BEGIN docs-registry -->", "<!-- END docs-registry -->"
CLASSES = {"operasional", "rencana", "log", "desain", "bukti", "sumber", "generated"}
LINK_CHECKED = {"operasional", "rencana", "desain"}
FILE_ONLY_DIRS = ("docs/", "docs/handover/", "docs/runbooks/", "docs/plans/")
LINK = re.compile(r"\]\(([^)\s]+)\)")


def tracked() -> list[str]:
    out_tracked = subprocess.run(
        ["git", "ls-files", "docs"], cwd=ROOT, capture_output=True, text=True
    )
    out_untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "docs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    combined = sorted(
        {
            p
            for p in (out_tracked.stdout.splitlines() + out_untracked.stdout.splitlines())
            if p and (ROOT / p).is_file()
        }
    )
    return combined


def registry() -> tuple[dict[str, str], list[str]]:
    problems: list[str] = []
    text = README.read_text(encoding="utf-8") if README.exists() else ""
    if BEGIN not in text or END not in text:
        return {}, [f"docs/README.md lacks {BEGIN} … {END}"]
    block = text.split(BEGIN, 1)[1].split(END, 1)[0]
    entries: dict[str, str] = {}
    for line in block.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or not cells[0].startswith("`"):
            continue
        path, cls = cells[0].strip("`"), cells[1]
        if not path.startswith("docs/"):
            problems.append(f"registry path must start with docs/: {path}")
        if cls not in CLASSES:
            problems.append(f"{path}: class '{cls}' not in {sorted(CLASSES)}")
        if path in entries:
            problems.append(f"{path}: registered twice")
        entries[path] = cls
    return entries, problems


def owner(path: str, entries: dict[str, str]) -> str:
    if path in entries:
        return path
    p = PurePosixPath(path).parent
    while str(p) != ".":
        key = f"{p.as_posix()}/"
        if key in entries:
            return key
        p = p.parent
    return ""


def check() -> list[str]:
    files = tracked()
    fileset = set(files)
    entries, problems = registry()
    for path in entries:
        if path.endswith("/"):
            if not any(f.startswith(path) for f in files):
                problems.append(f"registry folder {path} has no tracked files")
            if path in FILE_ONLY_DIRS:
                problems.append(f"{path} must list its files one by one, not as a folder")
        elif path not in fileset:
            problems.append(
                f"registry entry {path} does not exist (delete the row or the reference)"
            )
    for f in files:
        key = owner(f, entries)
        if not key:
            problems.append(
                f"{f} is not registered: add a row to docs/README.md or delete the file"
            )
            continue
        parent = f"{PurePosixPath(f).parent.as_posix()}/"
        if parent in FILE_ONLY_DIRS and key != f:
            problems.append(
                f"{f} sits in {parent}, which needs a file-level registry row"
            )
        if entries[key] in LINK_CHECKED and f.endswith(".md"):
            text = (ROOT / f).read_text(encoding="utf-8", errors="replace")
            for target in LINK.findall(text):
                t = target.split("#", 1)[0]
                if not t or t.startswith(("http://", "https://", "mailto:")):
                    continue
                if not (ROOT / f).parent.joinpath(t).resolve().exists():
                    problems.append(f"{f}: broken link {target}")
    active = 0
    for f in files:
        if f.startswith("docs/handover/") and f.endswith(".md"):
            active += sum(
                1
                for ln in (ROOT / f).read_text(encoding="utf-8").splitlines()
                if ln.startswith("## ACTIVE CHECKPOINT")
            )
    if active != 1:
        problems.append(
            f"docs/handover/ has {active} '## ACTIVE CHECKPOINT' headings; exactly one is allowed"
        )
    return problems


def stale(days: int) -> int:
    entries, _ = registry()
    now = time.time()
    rows = []
    for path, cls in entries.items():
        if cls not in ("operasional", "rencana", "log") or path.endswith("/"):
            continue
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", path],
            cwd=ROOT,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if out and (now - int(out)) / 86400 > days:
            rows.append((int((now - int(out)) / 86400), path, cls))
    for age, path, cls in sorted(rows, reverse=True):
        print(f"{age:4d} hari  {cls:<11} {path}")
    print(
        f"{len(rows)} dokumen {'/'.join(['operasional', 'rencana', 'log'])} tidak berubah > {days} hari: "
        "tinjau — perbarui, pindah ke bukti, atau hapus (standar docs/README.md)."
    )
    return 0


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--stale", type=int, metavar="DAYS", help="report, never fails")
    args = ap.parse_args(argv)
    if args.stale is not None:
        return stale(args.stale)
    problems = check()
    for p in problems:
        print(f"✗ {p}", file=sys.stderr)
    if problems:
        print(
            f"docs: {len(problems)} problem(s); see the registry rules in docs/README.md",
            file=sys.stderr,
        )
        return 1
    print(
        f"docs: OK ({len(tracked())} files registered, links resolve, one ACTIVE CHECKPOINT)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
