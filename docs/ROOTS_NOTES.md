# ROOTS acceptance notes

The supplied `scripts/test_roots.py` has two environment/test-fixture failures unrelated to
the roots implementation.

1. Its shell-loop assertion requires *every* `scripts/*.sh` file to contain
   `roots.py --get onedrive_ms1`.  `refresh_facts.sh` neither reads
   `patch_dup_v9_and_pav.py` nor resolves the OneDrive root; it only operates on an ms1-dup
   checkout.  ROOTS_SPEC.md requires the OneDrive lookup only in `build_all.sh`, so adding it
   to `refresh_facts.sh` would be an unrelated no-op.
2. The specified positive control (`REAL_MS1_DUP=/scratch/ch29576/rc_host/ms1-dup`) does not
   contain the pinned ms1-dup commit `603956f3296913edd354808dc7dd247cadbf7e36`:
   `git merge-base --is-ancestor 603956f3296913edd354808dc7dd247cadbf7e36 HEAD` exits 1 there.
   The checkout's current HEAD is `a4abc8d0`.  Consequently `roots.upstream_status()` correctly
   reports it stale, as ROOTS_SPEC.md requires.
