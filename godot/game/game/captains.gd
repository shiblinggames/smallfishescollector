class_name Captains
extends RefCounted
## THE CAPTAINS' SAVES ON THIS MACHINE (Godot port, stage 1).
##
## One file per captain, user://captains/<id>.json, in the web's local save
## format (SaveFile). user:// is "%APPDATA%/Seas the Booty" (project.godot sets
## the folder name), which is what Steam Auto-Cloud will sync. Writes are
## atomic (SaveFile.write_file). The captain select screen comes later; until
## then the game opens the most recently played captain, or starts one.

const DIR: String = "user://captains"


static func _species() -> Array:
	return JsJson.parse(FileAccess.get_file_as_string("res://content/fish_species.json"))


static func _path(id: String) -> String:
	return "%s/%s.json" % [DIR, id]


## Every captain id here, the most recently written first.
static func list() -> Array:
	DirAccess.make_dir_recursive_absolute(DIR)
	var out: Array = []
	for f: String in DirAccess.get_files_at(DIR):
		if f.ends_with(".json"):
			out.append(f.get_basename())
	out.sort_custom(func(a: String, b: String) -> bool:
		return FileAccess.get_modified_time(_path(a)) > FileAccess.get_modified_time(_path(b)))
	return out


## { save, carried } or { error }.
static func open(id: String) -> Dictionary:
	var text: String = FileAccess.get_file_as_string(_path(id))
	if text == "":
		return { "error": "no save for %s" % id }
	return SaveFile.deserialize(text, _species())


## A new captain's save: the web's starter (content/rules.json "starter"), with
## this captain's id, default name and start date.
static func create(id: String) -> Dictionary:
	var save: Dictionary = (Rules.data()["starter"] as Dictionary).duplicate(true)
	save["uid"] = id
	var profile: Dictionary = save["profile"]
	profile["id"] = id
	profile["username"] = "crew_" + id.replace("-", "").right(5)
	profile["created_at"] = Js.iso(Clock.now_ms())
	save["species"] = _species()
	return { "save": save, "carried": {} }


static func write(save: Dictionary, carried: Dictionary) -> Error:
	DirAccess.make_dir_recursive_absolute(DIR)
	var text: String = SaveFile.serialize(save, carried, Js.iso(Clock.now_ms()))
	return SaveFile.write_file(ProjectSettings.globalize_path(_path(save["uid"])), text)


static func new_id() -> String:
	var bytes: PackedByteArray = Crypto.new().generate_random_bytes(6)
	return "captain-" + bytes.hex_encode()
