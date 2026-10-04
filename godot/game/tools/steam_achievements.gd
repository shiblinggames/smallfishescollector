extends SceneTree
## THE STEAM ACHIEVEMENT LIST: every badge the port awards (Achievements.defs),
## as godot/steam/achievements.csv for entering in Steamworks (Stats &
## Achievements): API name (the badge id, which SteamLayer.achieve sets), display
## name, description, points, and the badge art its icons are made from
## (tools/steam_achievement_icons.mjs makes the 64px unlocked and greyed ones).
##
##   godot --headless --path godot/game -s tools/steam_achievements.gd


func _init() -> void:
	var rows: Array = ["api_name,display_name,description,points,image"]
	var defs: Array = Achievements.defs()
	defs.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a["points"]) < float(b["points"]) if float(a["points"]) != float(b["points"]) else str(a["id"]) < str(b["id"]))
	for d: Dictionary in defs:
		rows.append(",".join(PackedStringArray([d["id"], _q(str(d["name"])), _q(str(d["description"])), str(int(d["points"])), str(d.get("imageUrl", ""))])))
	var f: FileAccess = FileAccess.open(ProjectSettings.globalize_path("res://").path_join("../steam/achievements.csv"), FileAccess.WRITE)
	f.store_string("\n".join(PackedStringArray(rows)) + "\n")
	f.close()
	print("  achievements.csv: %d achievements" % defs.size())
	quit(0)


static func _q(s: String) -> String:
	return "\"%s\"" % s.replace("\"", "\"\"")
