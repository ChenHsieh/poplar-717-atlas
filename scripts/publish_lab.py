#!/usr/bin/env python3
"""Publish one release of the atlas to the lab's public repo as ONE commit.

    python3 scripts/publish_lab.py --lab <clone of TsailabBioinformatics/poplar-717-atlas> [--ref origin/main]

Takes the committed tree at --ref (never the working tree), leaves out what stays private
(docs/, the working TODO.md), swaps in TODO_public.md as TODO.md, replaces local machine paths
and the author's cluster email with placeholders, refuses on anything that must never be public,
then mirrors the result into the lab clone and commits "Release <VERSION>". Pushing is left to
the caller, so the commit can be looked at first.

Why a snapshot per release and not this repo's history: older commits carry curation notes that
were removed from the data, and withdrawn numbers from earlier versions. The lab repo's history
starts clean and reads like the changelog.
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVATE = ("docs/", "TODO.md", "TODO_public.md", "README.md", "README_public.md", "scripts/publish_lab.py")
PUBLIC_SWAP = {"TODO_public.md": "TODO.md", "README_public.md": "README.md"}
SANITIZE = [
    (re.compile(r"/Users/chenhsieh/[^\s'\"`)]*?OneDrive[^/\s'\"`)]*/"), "<onedrive>/"),
    (re.compile(r"/Users/chenhsieh/"), "<home>/"),
    (re.compile(r"/home/ch29576/"), "<home>/"),
    (re.compile(r"/scratch/ch29576/"), "<scratch>/"),
    (re.compile(r"ch29576@uga\.edu"), "<email>"),
]
# Must never be public. Checked over EVERY file, data included.
FORBID = [
    ("curation notes", re.compile(rb"curator wrote|cj_2026\d{4}")),
    ("credential", re.compile(rb"ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9-]{10,}"
                              rb"|-----BEGIN [A-Z ]*PRIVATE KEY")),
]
# Local paths are only allowed in data/meta/manifest.json, which the live site already serves.
PATHS = re.compile(rb"/Users/chenhsieh|/home/ch29576|/scratch/ch29576|ch29576@")
PATHS_OK = {"data/meta/manifest.json"}


def run(*a, cwd=ROOT, **k):
    return subprocess.run(a, cwd=cwd, check=True, capture_output=True, **k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lab", required=True)
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--held", default="/scratch/ch29576/atlas_v12_ks/goi_terms.txt",
                    help="file of held candidate-gene labels (kept OUTSIDE the repo); each must not appear")
    ap.add_argument("--allow-missing-held", action="store_true",
                    help="publish even if the held-label list is absent (not recommended)")
    a = ap.parse_args()
    version = run("git", "show", f"{a.ref}:VERSION").stdout.decode().strip()
    tmp = tempfile.mkdtemp(prefix="atlas_publish_")
    tarfile.open(fileobj=io.BytesIO(run("git", "archive", a.ref).stdout)).extractall(tmp, filter="data")

    for p in PRIVATE:
        q = os.path.join(tmp, p)
        if p in PUBLIC_SWAP and os.path.exists(q):
            shutil.move(q, os.path.join(tmp, PUBLIC_SWAP[p]))     # public version over the private one
        elif os.path.isdir(q):
            shutil.rmtree(q)
        elif os.path.exists(q) and p not in PUBLIC_SWAP.values():
            os.remove(q)

    forbid = list(FORBID)
    if os.path.exists(a.held):
        terms = [t.strip() for t in open(a.held) if ":" in t]
        forbid.append(("held candidate label", re.compile(
            rb"(?<![A-Za-z0-9_])(?:" + b"|".join(re.escape(t.encode()) for t in terms) + rb")(?![A-Za-z0-9])")))
        print(f"checking {len(terms)} held candidate labels")
    elif a.allow_missing_held:
        print(f"WARNING: no held-label list at {a.held}; that check is skipped (--allow-missing-held)")
    else:
        # 0.18.0 shipped three held labels in a script docstring because this was a warning and the
        # list lives only on Sapelo2. A publish that cannot run the check must not happen.
        print(f"REFUSING: no held-label list at {a.held}. Run on a machine that has it, or pass "
              f"--held PATH. --allow-missing-held exists only for a deliberate, recorded exception.")
        return 1
    changed, bad = 0, []
    for dp, _, fs in os.walk(tmp):
        for fn in fs:
            p = os.path.join(dp, fn)
            rel = os.path.relpath(p, tmp)
            b = open(p, "rb").read()
            if not rel.startswith("data/") and b"\0" not in b[:4096]:
                s = b.decode("utf-8", "replace")
                t = s
                for rx, rep in SANITIZE:
                    t = rx.sub(rep, t)
                if t != s:
                    open(p, "w").write(t)
                    b = t.encode()
                    changed += 1
            for name, rx in forbid:
                if rx.search(b):
                    bad.append(f"{name}: {rel}")
            if rel not in PATHS_OK and PATHS.search(b):
                bad.append(f"local path: {rel}")
    if bad:
        print("REFUSING, not public-safe:\n  " + "\n  ".join(sorted(set(bad))[:40]))
        return 1
    print(f"release {version}: {changed} files had local paths replaced; nothing forbidden found")

    # mirror into the lab clone, keeping its .git
    for x in os.listdir(a.lab):
        if x == ".git":
            continue
        q = os.path.join(a.lab, x)
        shutil.rmtree(q) if os.path.isdir(q) and not os.path.islink(q) else os.remove(q)
    for x in os.listdir(tmp):
        shutil.move(os.path.join(tmp, x), os.path.join(a.lab, x))
    shutil.rmtree(tmp)
    run("git", "add", "-A", cwd=a.lab)
    if not run("git", "status", "--porcelain", cwd=a.lab).stdout.strip():
        print("no changes since the last published release")
        return 0
    title = f"Release {version}"
    if title in run("git", "log", "--format=%s", cwd=a.lab).stdout.decode():
        # a site-only change keeps the data version; say so instead of repeating the title
        import datetime
        title += f", site update {datetime.date.today().isoformat()}"
    run("git", "commit", "-q", "-m", f"{title}\n\nSee CHANGELOG.md for what changed.", cwd=a.lab)
    print(run("git", "log", "--oneline", "-1", cwd=a.lab).stdout.decode().strip(), "(not pushed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
