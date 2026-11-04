#!/usr/bin/env python3
"""Run all offline suites without an installed plugin or personal usage records."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
count = 0
for test in sorted((root / "tests").glob("test_*")):
    if test.suffix not in (".py", ".mjs"):
        continue
    count += 1
    command = [sys.executable if test.suffix == ".py" else "node", str(test)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    print(f"{'PASS' if result.returncode == 0 else 'FAIL'} {test.name}", flush=True)
    if result.returncode:
        print(result.stdout, result.stderr)
        sys.exit(result.returncode)
battle_tests = sorted((root / "battle/tests").glob("*.test.mjs"))
if battle_tests:
    result = subprocess.run(["node", "--test", *map(str, battle_tests)], cwd=root)
    if result.returncode:
        sys.exit(result.returncode)
print(f"All {count} Python/JS suites and {len(battle_tests)} battle suites passed; all saves are temporary.")
