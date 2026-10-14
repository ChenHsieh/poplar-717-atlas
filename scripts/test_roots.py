#!/usr/bin/env python3
"""Acceptance test for scripts/roots.py and the roots refactor (docs/ROOTS_SPEC.md). Written by the Sapelo2
dissertation session; the implementer must not edit it. Prints ALL ROOTS TESTS PASS."""
import ast, glob, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
fails = []

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  -- {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)

OD = "/Users/chenhsieh/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work"
PREFIX = [  # longest first
    ("/scratch/ch29576/poplar-717-atlas", "atlas"), ("/scratch/ch29576/ms1-dup", "ms1_dup"),
    ("/scratch/ch29576/ms2-lsg", "ms2_lsg"), ("~/dev/ms2-scratch/ms2-lsg", "ms2_lsg"), ("~/dev/ms1-dup", "ms1_dup"),
    ("~/dev/ms2-lsg", "ms2_lsg"), ("~/ms1-dup", "ms1_dup"), (OD + "/MS1_2026", "onedrive_ms1"),
    (OD, "onedrive_work"), ("~/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work/MS1_2026", "onedrive_ms1"),
    ("~/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work", "onedrive_work"),
    ("/scratch/ch29576", "scratch"), ("/work/cjtlab", "work")]
OD_TILDE = "~/Library/CloudStorage/OneDrive-UniversityofGeorgia/01_work"

def to_root(lit):
    for p, name in PREFIX:
        if lit == p or lit.startswith(p + "/") or (lit.startswith(p) and p in (OD, OD_TILDE)):
            return name, lit[len(p):].lstrip("/")
    return None, lit

def calls(tree):
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in ("path", "root") \
                and isinstance(n.func.value, ast.Name) and n.func.value.id == "roots":
            args = [a.value for a in n.args if isinstance(a, ast.Constant) and isinstance(a.value, str)]
            if args:
                out.add((args[0], args[1] if len(args) > 1 else ""))
    return out

# 1. every old literal is still referenced through roots, in the same file
old = json.load(open(os.path.join(REPO, "docs", "OLD_LITERALS.json")))
for f, lits in sorted(old.items()):
    p = os.path.join(REPO, f)
    if f.endswith(".sh"):
        continue
    if not os.path.exists(p):
        check(f"{f} still exists", False); continue
    have = calls(ast.parse(open(p).read()))
    missing = []
    for lit in lits:
        if lit in ("/scratch/", "/scratch"):   # piece of an f"/scratch/{user}/<repo>" candidate list
            if not any(n in ("ms1_dup", "ms2_lsg", "scratch") for n, _ in have):
                missing.append("candidate list built from /scratch/ not replaced by roots")
            continue
        name, rel = to_root(lit)
        if name is None:
            missing.append(f"unmapped literal {lit}"); continue
        rel = rel.rstrip("/")
        ok = any(n == name and (r.rstrip("/") == rel or rel.startswith(r.rstrip("/") + "/") or r.rstrip("/").startswith(rel)
                                or (r == "" and rel == ""))
                 for n, r in have)
        if not ok:
            missing.append(f"{name}:{rel}")
    check(f"{f}: all {len(lits)} old paths reached through roots", not missing, "; ".join(missing[:5]))

# 2. no machine literal left (py: any string constant; sh: any text)
MACHINE = re.compile(r"(^|[\"'\s=(])(/scratch/|/work/cjtlab|/Users/chenhsieh|~/dev/|~/ms1-dup|~/Library/CloudStorage)")
for f in sorted(glob.glob(os.path.join(HERE, "*.py"))):
    b = os.path.basename(f)
    if b in ("roots.py", "publish_lab.py", "test_roots.py"):
        continue
    left = [n.value for n in ast.walk(ast.parse(open(f).read()))
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and MACHINE.search(" " + n.value)
            and not n.value.lstrip().startswith(("#", "\n"))]
    left = [x for x in left if not re.search(r"\s", x.strip()) or x.strip().startswith(("/", "~"))]  # ignore prose
    check(f"no machine path literal in {b}", not left, str(left[:3]))
for f in sorted(glob.glob(os.path.join(HERE, "*.sh"))):
    code = [l for l in open(f) if not l.lstrip().startswith("#")]
    bad = [l.strip() for l in code if re.search(r"/scratch/ch29576|/work/cjtlab|/Users/chenhsieh", l)]
    check(f"no machine path in {os.path.basename(f)}", not bad, str(bad[:2]))
    check(f"{os.path.basename(f)} no longer parses patch_dup_v9_and_pav.py for the OneDrive root",
          "patch_dup_v9_and_pav.py\").read()" not in open(f).read() and "roots.py --get onedrive_ms1" in open(f).read())

# 3. resolution order, run in a clean subprocess per case
def resolve(name, env):
    e = {"PATH": "/usr/bin:/bin", "HOME": env.pop("HOME", "/home/ch29576"), "USER": env.pop("USER", "ch29576")}
    e.update(env)
    r = subprocess.run([sys.executable, "-c", f"import sys; sys.path.insert(0, {HERE!r}); import roots; print(roots.root({name!r}))"],
                       capture_output=True, text=True, env=e)
    return r.stdout.strip() or r.stderr.strip()[-200:]

tmp = tempfile.mkdtemp(prefix="roots_test_")
check("env MS1_DUP_ROOT wins", resolve("ms1_dup", {"MS1_DUP_ROOT": tmp}) == tmp)
check("legacy env MS1_DUP still honoured", resolve("ms1_dup", {"MS1_DUP": tmp}) == tmp)
check("MS1_DUP_ROOT beats legacy MS1_DUP", resolve("ms1_dup", {"MS1_DUP_ROOT": tmp, "MS1_DUP": "/nonexistent"}) == tmp)
check("env value used even if missing", resolve("ms2_lsg", {"MS2_LSG_ROOT": "/nonexistent/x"}) == "/nonexistent/x")
fake_home = tempfile.mkdtemp(prefix="home_")
os.makedirs(os.path.join(fake_home, "dev", "ms1-dup"))
check("first EXISTING candidate (~/dev/ms1-dup)", resolve("ms1_dup", {"HOME": fake_home}) == os.path.join(fake_home, "dev", "ms1-dup"))
check("scratch default follows $USER", resolve("scratch", {"USER": "someone"}) == "/scratch/someone")
check("work default", resolve("work", {}) == "/work/cjtlab")
check("onedrive default unchanged", resolve("onedrive_ms1", {}) == OD + "/MS1_2026")
check("atlas root is THIS repository (worktree-safe), env cannot move it",
      resolve("atlas", {"ATLAS_ROOT": "/scratch/ch29576/poplar-717-atlas"}) == REPO)

# 4. upstream staleness guard
import roots  # noqa: E402
pins = json.load(open(os.path.join(REPO, "sources", "upstream_pins.json")))
check("pins file names ms1_dup and ms2_lsg with full commit ids",
      set(pins) >= {"ms1_dup", "ms2_lsg"} and all(re.fullmatch(r"[0-9a-f]{40}", pins[k]) for k in ("ms1_dup", "ms2_lsg")))
g = tempfile.mkdtemp(prefix="stale_")
subprocess.run(["git", "init", "-q", g], check=True)
subprocess.run(["git", "-C", g, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"], check=True)
os.environ["MS1_DUP_ROOT"] = g
st = {d.get("name", d.get("root")): d for d in roots.upstream_status()}
check("a checkout without the pinned commit is NOT ok", st.get("ms1_dup", {}).get("ok") is False, str(st.get("ms1_dup")))
os.environ["MS1_DUP_ROOT"] = "/nonexistent/ms1"
st = {d.get("name", d.get("root")): d for d in roots.upstream_status()}
check("a missing checkout is NOT ok", st.get("ms1_dup", {}).get("ok") is False)
real = os.environ.get("REAL_MS1_DUP")
if real:
    os.environ["MS1_DUP_ROOT"] = real
    st = {d.get("name", d.get("root")): d for d in roots.upstream_status()}
    check("the current ms1-dup checkout IS ok (positive control)", st.get("ms1_dup", {}).get("ok") is True, str(st.get("ms1_dup")))
else:
    print("NOTE positive control skipped: set REAL_MS1_DUP to a current ms1-dup checkout")
r = subprocess.run([sys.executable, os.path.join(HERE, "roots.py")], capture_output=True, text=True,
                   env={**os.environ, "MS1_DUP_ROOT": g})
check("roots.py CLI exits 1 on a stale upstream", r.returncode == 1, r.stdout[-300:])

print("\nALL ROOTS TESTS PASS" if not fails else f"\n{len(fails)} ROOTS TEST(S) FAILED")
sys.exit(1 if fails else 0)
