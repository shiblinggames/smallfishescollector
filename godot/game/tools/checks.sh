#!/bin/bash
# Before a commit: every *_check.gd, the two smokes, the two-copy Charter
# smoke and parity. Expect "test files with problems: 0", "0 failed, 0
# errors" twice and "parity ok".
#   tools/checks.sh
G="${GODOT:-/c/Users/Kong/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe}"
P="$(cd "$(dirname "$0")/.." && pwd)"
cd "$P"
bad=0
H=$(mktemp); C=$(mktemp)
for f in tests/*_check.gd tests/smoke_fishing.gd tests/smoke_docking.gd; do
  # import_check needs IMPORT_DIR (a folder of converted web captains).
  [ "$(basename $f)" = import_check.gd ] && [ -z "$IMPORT_DIR" ] && continue
  out=$(timeout 600 "$G" --headless --path "$P" -s "$f" 2>&1)
  n=$(echo "$out" | grep -c "SCRIPT ERROR")
  last=$(echo "$out" | grep -E "ok|FAILED" | tail -1)
  if [ "$n" != "0" ] || echo "$last" | grep -q FAILED || [ -z "$last" ]; then bad=$((bad+1)); echo "PROBLEM $(basename $f .gd) | $last | script_errors=$n"; fi
done
echo "test files with problems: $bad"
timeout 300 "$G" --headless --path "$P" -s tests/smoke_charter.gd -- --role=host --as=anna --charter-port=24671 > "$H" 2>&1 &
sleep 3
timeout 300 "$G" --headless --path "$P" -s tests/smoke_charter.gd -- --role=crew --as=ben --charter-port=24671 > "$C" 2>&1
wait
echo "host: $(grep -c FAILED "$H") failed, $(grep -c 'SCRIPT ERROR' "$H") errors; crew: $(grep -c FAILED "$C") failed, $(grep -c 'SCRIPT ERROR' "$C") errors"
cd "$P/.." && node game/tools/parity.mjs 2>&1 | grep -E "parity ok|FAIL" | tail -5
