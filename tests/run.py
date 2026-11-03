#!/usr/bin/env python3
"""Run all offline suites without an installed plugin or personal usage records."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
for test in sorted((root / "tests").glob("test_*")):
    if test.suffix not in (".py", ".mjs"):
        continue
    command = [sys.executable if test.suffix == ".py" else "node", str(test)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    print(f"{'PASS' if result.returncode == 0 else 'FAIL'} {test.name}", flush=True)
    if result.returncode:
        print(result.stdout, result.stderr)
        sys.exit(result.returncode)
print("All 11 suites passed (temporary state, synthetic fixtures, no network).")
