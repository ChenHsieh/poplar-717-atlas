# One roots module for the atlas build (spec, 2026-10-14)

## Why
The build scripts reach their inputs through 84 hard-coded paths in 33 files (`/scratch/ch29576/...`,
`/work/cjtlab/...`, the Mac OneDrive tree, `~/dev/...`) and through four differently named environment variables
(MS1_DUP, MS1_DUP_ROOT, MS1_DUP_REPO, MS2_LSG_ROOT). On Sapelo2 the defaults point at `/scratch/ch29576/ms1-dup`,
`/scratch/ch29576/ms2-lsg` and `/scratch/ch29576/poplar-717-atlas`, which are shared primary checkouts that other
sessions leave on old branches: on 2026-10-14 the ms1-dup one was weeks behind main. A build there would read stale
tables and pass every internal check. Writers also default to `/scratch/ch29576/poplar-717-atlas/data`, so a build
run from a worktree writes into someone else's checkout.

## What to build
`scripts/roots.py` (stdlib only):
- `ROOTS`: logical name -> (env variables in priority order, candidate paths in order). Names and candidates:
  - `atlas`: no env; ALWAYS the repository that contains `roots.py` (parent of `scripts/`).
  - `ms1_dup`: env `MS1_DUP_ROOT`, then legacy `MS1_DUP`, `MS1_DUP_REPO`; candidates `~/dev/ms1-dup`,
    `/scratch/$USER/ms1-dup`, `~/ms1-dup`.
  - `ms2_lsg`: env `MS2_LSG_ROOT`; candidates `~/dev/ms2-lsg`, `~/dev/ms2-scratch/ms2-lsg`, `/scratch/$USER/ms2-lsg`.
  - `scratch`: env `SCRATCH_ROOT`; candidates `/scratch/$USER`.
  - `work`: env `WORK_ROOT`; candidates `/work/cjtlab`.
  - `onedrive_ms1`: env `ONEDRIVE_MS1_ROOT`; candidates
    `/Users/chenhsieh/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work/MS1_2026`.
  - `onedrive_work`: env `ONEDRIVE_WORK_ROOT`; candidates
    `/Users/chenhsieh/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work`.
  `~` and `$USER` are expanded. An env variable that is set wins even if the path does not exist.
- `root(name)`: the env value if set, else the first EXISTING candidate, else the first candidate (so a missing
  source still produces a path that preflight reports as missing, exactly as today).
- `path(name, rel="")`: `os.path.join(root(name), rel)`; `rel` is a plain relative string.
- `upstream_status()`: for `ms1_dup` and `ms2_lsg`, read `sources/upstream_pins.json`
  (`{"ms1_dup": "<commit>", "ms2_lsg": "<commit>"}`) and report, per root: the resolved path, whether it is a git
  work tree (`git rev-parse --is-inside-work-tree`, which also accepts worktrees), and whether the pinned commit
  is an ANCESTOR of its HEAD (`git merge-base --is-ancestor`). Return a list of dicts; a root is `ok` only when all
  three hold.
- `python3 scripts/roots.py` prints every root, its value, where it came from (env / candidate / default) and the
  upstream status, and exits 1 if any upstream root is not ok. `python3 scripts/roots.py --get NAME` prints one root
  (for shell scripts).

Create `sources/upstream_pins.json` with ms1_dup = `603956f3296913edd354808dc7dd247cadbf7e36` and ms2_lsg =
`acee2ca55a974394b7e47b12777d96d56f895caa` (the commits this release was checked against).

## Refactor rules
1. In every `scripts/*.py` except `roots.py`, `publish_lab.py` (its regexes are sanitiser patterns, leave them) and
   `test_roots.py`: replace each machine path literal by `roots.path("<name>", "<rel>")` or `roots.root("<name>")`
   with STRING-CONSTANT arguments (the test reads them with `ast`). Keep f-string tails outside the call, e.g.
   `f"{roots.path('scratch', 'ms2_genespace/workdir/bed')}/{fname}.bed"`.
2. Mapping of old prefixes to roots (longest prefix wins): `/scratch/ch29576/ms1-dup`, `~/dev/ms1-dup`,
   `~/ms1-dup` -> ms1_dup; `/scratch/ch29576/ms2-lsg`, `~/dev/ms2-lsg`, `~/dev/ms2-scratch/ms2-lsg` -> ms2_lsg;
   `/scratch/ch29576/poplar-717-atlas` -> atlas; other `/scratch/ch29576/` -> scratch; `/work/cjtlab/` -> work;
   `.../01_work/MS1_2026` (also spelled `~/Library/CloudStorage/...`) -> onedrive_ms1; other `.../01_work/` -> onedrive_work. A bare `"/scratch/"` used to build per-user candidates goes away with the candidate list.
3. Where a script already reads an env variable for a root (MS1_DUP, CH3_TABLE, MS1_EXPR, ...), keep the
   variable working: either through roots (ms1_dup) or by leaving that `os.environ.get` in place with a roots-based
   default.
4. Candidate lists that scripts build themselves (check_facts.py, check_ms2_canon.py, make_founder_source.py,
   make_pool_frozen_source.py, patch_syntelog_categories.py) become `roots.root(...)`; keep their error messages.
5. `scripts/import` mechanics: scripts are run as `python3 scripts/X.py` from the repo root; add
   `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))` before `import roots` where needed.
6. `scripts/build_all.sh`: find the OneDrive tree with `python3 scripts/roots.py --get onedrive_ms1` instead of
   reading `patch_dup_v9_and_pav.py` with a regex, and run `python3 scripts/roots.py` (upstream status) right after
   `check_stages.py`, refusing to build if it exits 1. No machine path literal may remain in any `scripts/*.sh`.
7. `preflight.py` builds its SOURCES with roots and also refuses (exit 1) when `upstream_status()` is not ok.
8. Do not change what any script computes or writes; only where it finds things. Do not touch `data/`, `js/`,
   `css/`, `index.html`.

## Acceptance
`python3 scripts/test_roots.py` prints `ALL ROOTS TESTS PASS`. It reads `docs/OLD_LITERALS.json` (the 84 literals
recorded before the refactor) and checks that each is still referenced through roots in the same file, that no
machine literal remains, the resolution order, worktree safety of `atlas`, and that a stale checkout is refused.
Also run `python3 scripts/check_stages.py` and `python3 -m py_compile scripts/*.py` (both must pass) and
`bash -n scripts/build_all.sh`.
