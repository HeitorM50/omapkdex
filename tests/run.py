#!/usr/bin/env python3
"""Run all offline suites without an installed plugin or personal usage records."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]


def battle_runtime_installed() -> bool:
    # Mesmos dois lugares que battle/deps.mjs procura: node_modules ao lado do
    # código (checkout de desenvolvimento) ou o cache do setup.mjs.
    cache = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    bases = [root / "battle", cache / "omarchy/io.github.heitorm50.omapkdex/battle-runtime"]
    return any((b / "node_modules/@pkmn/sim").is_dir() and (b / "node_modules/bonjour-service").is_dir()
               for b in bases)


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
if battle_tests and not battle_runtime_installed():
    print(f"SKIP {len(battle_tests)} battle suites: runtime not installed (run node battle/setup.mjs)")
    print(f"All {count} Python/JS suites passed; battle suites skipped; all saves are temporary.")
    sys.exit(0)
if battle_tests:
    result = subprocess.run(["node", "--test", *map(str, battle_tests)], cwd=root)
    if result.returncode:
        sys.exit(result.returncode)
print(f"All {count} Python/JS suites and {len(battle_tests)} battle suites passed; all saves are temporary.")
