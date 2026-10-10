class_name Captains
extends RefCounted
## THE CAPTAINS' SAVES ON THIS MACHINE (Godot port, stage 1).
##
## One file per captain, user://captains/<id>.json, in the web's local save
## format (SaveFile). user:// is "%APPDATA%/Seas the Booty" (project.godot sets
## the folder name), which is what Steam Auto-Cloud will sync. Writes are
## atomic (SaveFile.write_file). The title screen (Title) lists them.

const DIR: String = "user://captains"
## Where the saves go; tests point it at a scratch folder.
static var dir_override: String = ""


static func _dir() -> String:
	return dir_override if dir_override != "" else DIR


## The species file, parsed once per run (92 KB through the GDScript JSON
## parser on every captain card, every berth and every welcome added up). Each
## caller gets its own deep copy, since it lands in a save as save.species.
static var _species_cache: Array = []


static func _species() -> Array:
	if _species_cache.is_empty():
		_species_cache = JsJson.parse(FileAccess.get_file_as_string("res://content/fish_species.json"))
	return _species_cache.duplicate(true)


static func _path(id: String) -> String:
	return "%s/%s.json" % [_dir(), id]


## Every captain id here, the most recently written first.
static func list() -> Array:
	DirAccess.make_dir_recursive_absolute(_dir())
	var out: Array = []
	for f: String in DirAccess.get_files_at(_dir()):
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
	DirAccess.make_dir_recursive_absolute(_dir())
	Playtest.stamp(save)
	var text: String = SaveFile.serialize(save, carried, Js.iso(Clock.now_ms()))
	return SaveFile.write_file(ProjectSettings.globalize_path(_path(save["uid"])), text)


static func new_id() -> String:
	var bytes: PackedByteArray = Crypto.new().generate_random_bytes(6)
	return "captain-" + bytes.hex_encode()


## What the title screen shows of a captain: name, level, purse, when last
## played (unix seconds), and their look for the portrait.
static func summary(id: String) -> Dictionary:
	var loaded: Dictionary = open(id)
	if loaded.has("error"):
		return { "id": id, "error": loaded["error"] }
	var p: Dictionary = (loaded["save"] as Dictionary)["profile"]
	return {
		"id": id, "name": str(Js.nz(p.get("username"), "Captain")),
		"level": Rules.level_from_xp(Js.num(p.get("fishing_xp"))),
		"doubloons": Js.num(p.get("doubloons")),
		"at": FileAccess.get_modified_time(_path(id)),
		"look": Skipper.look_of(p),
	}


## IMPORT A CAPTAIN (test builds only, Playtest): a save file from anywhere
## (a web captain converted by tools/import_web_captain.mts) checked and written
## in as its own captain; one already here with the same id is kept beside it
## as <id>.json.bak. { name } or { error }.
static func import_file(file_path: String) -> Dictionary:
	if Playtest.release():
		return { "error": "Importing is for test builds only." }
	var loaded: Dictionary = SaveFile.deserialize(FileAccess.get_file_as_string(file_path), _species())
	if loaded.has("error"):
		return { "error": "That file is not a captain's save (%s)." % loaded["error"] }
	var save: Dictionary = loaded["save"]
	if str(save.get("uid", "")) == "":
		return { "error": "That save has no captain in it." }
	DirAccess.make_dir_recursive_absolute(_dir())
	var at: String = _path(save["uid"])
	if FileAccess.file_exists(at):
		DirAccess.copy_absolute(at, at + ".bak")
	var err: Error = write(save, loaded["carried"])
	if err != OK:
		return { "error": "It could not be written: %s" % error_string(err) }
	return { "name": str(Js.nz((save["profile"] as Dictionary).get("username"), "Captain")) }


## RETIRE: the file moves to retired/<id>-<stamp>.json. Nothing is deleted; a
## slip is undone by moving the file back by hand.
static func retire(id: String) -> Error:
	var to_dir: String = "%s/../retired" % _dir()
	DirAccess.make_dir_recursive_absolute(to_dir)
	var stamp: String = Time.get_datetime_string_from_system(true).replace(":", "").replace("-", "")
	return DirAccess.rename_absolute(_path(id), "%s/%s-%s.json" % [to_dir, id, stamp])


## A new captain, named (or with the default name), written and ready to play.
static func make(captain_name: String, color: String = "default") -> Session:
	var fresh: Dictionary = create(new_id())
	var s: Session = Session.new(fresh["save"], fresh["carried"])
	if captain_name.strip_edges() != "":
		s.profile()["username"] = captain_name.strip_edges()
	# One of the free starting colours (the web's first-visit setup).
	s.profile()["character_color"] = color
	s.persist()
	return s
