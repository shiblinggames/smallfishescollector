#!/bin/bash
# The full visual sweep: every shot case, tab variants and KingKong's save,
# with LAYOUT=1 (tests/layout_audit.gd); pictures and layout.txt into $1.
# Needs a window. Read layout.txt for LAYOUT and SCRIPT ERROR lines, then
# LOOK at the pictures: drawn things (rims, seams) the audit cannot see.
#   tools/sweep.sh /some/folder
OUT="$1"; mkdir -p "$OUT"; : > "$OUT/layout.txt"
G="${GODOT:-/c/Users/Kong/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe}"
P="$(cd "$(dirname "$0")/.." && pwd)"
# KK: a full save to see the screens with a whole game's data (KingKong's).
KK="${KK_SAVE:-C:/Users/Kong/AppData/Roaming/Seas the Booty/captains/a67c8905-45a9-4a71-9720-f6396187fde6.json}"
shoot() { # name, case, env...
  local name="$1" what="$2"; shift 2
  echo "## $name" >> "$OUT/layout.txt"
  env LAYOUT=1 "$@" timeout 200 "$G" --path "$P" -s tests/shot.gd -- "$OUT/$name.png" $what 2>&1 | grep -E "^LAYOUT|SCRIPT ERROR|^   at: " >> "$OUT/layout.txt"
}
for c in dial card crate golden level look loadout hold almanac giants boss slain finn rankup dock ashore market tackle rods shelf buyer title crew purse vote shipyard yardport hotspot isle landed wanderers peddler regular talk crest portal portalsheet deadportal wake waiting levels achievements clue arch anchorage worldchart crewhall crewroster crewhalltier crossing digsite bottle chart course wheel titlenew stow crates crateopen fight boattab orders trawls voyages bounties forge homestead tavern baitpick angler journal chaptercard crewtrunk skinreveal finnmoment crewbunks battle coop ready campaign puzzle dive log ending; do shoot $c $c; done
shoot runner "runner night"   # runners sail only at night
for g in slots roulette blackjack; do shoot den_$g den DEN_GAME=$g; done
for t in board capstan king; do shoot parlor_$t parlor PARLOR_TAB=$t; done
for t in hold match minefield rigging world; do shoot chart_$t chartroom CHART_TAB=$t; done
shoot crew_book crew CREW_ROOM=book
for c in achievements almanac boattab crewhall crewroster forge hold homestead journal levels loadout market orders shipyard tackle worldchart; do shoot kk_$c $c SHOT_SAVE="$KK"; done
echo DONE >> "$OUT/layout.txt"
