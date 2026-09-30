class_name Charter
extends RefCounted
## A CHARTER'S WORLD ON THE FOUNDER'S MACHINE (Godot port, the Charter slice;
## docs/systems/steam-port.md, "The Charter").
##
## One file, user://charters/<id>.json: the Charter's name, whether it is
## hardcore (fixed at founding), who founded it, whether it has set sail (the
## roster locks then), and a berth per member (up to four), each holding that
## member's CHARTER CAPTAIN as a whole save in the local save format. Charter
## captains live only in here, so nothing reaches a solo game and nothing comes
## in from one. Written atomically after every change.
##
## NOT YET (the Charter's shared rules, the next pass): one purse, one Almanac,
## one market and the crew chest. Each captain still carries their own.

const DIR: String = "user://charters"
const BERTHS: int = 4
static var dir_override: String = ""

var data: Dictionary = {}
## Each member's captain, opened: key -> Session.
var sessions: Dictionary = {}


static func _dir() -> String:
	return dir_override if dir_override != "" else DIR


static func _path(id: String) -> String:
	return "%s/%s.json" % [_dir(), id]


## The Charters this machine founded (or was handed), most recent first.
static func list() -> Array:
	DirAccess.make_dir_recursive_absolute(_dir())
	var out: Array = []
	for f: String in DirAccess.get_files_at(_dir()):
		if not f.ends_with(".json"):
			continue
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string("%s/%s" % [_dir(), f]))
		if d is Dictionary:
			var names: Array = []
			for b: Dictionary in (d as Dictionary).get("berths", []):
				names.append(b.get("name", "?"))
			out.append({ "id": d["id"], "name": d["name"], "hardcore": d.get("hardcore", false), "sailed": d.get("sailed", false), "crew": names, "founder": d.get("founder", ""), "at": FileAccess.get_modified_time(_path(d["id"])) })
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["at"]) > int(b["at"]))
	return out


static func found(charter_name: String, hardcore: bool, founder_key: String, captain_name: String) -> Charter:
	var c: Charter = Charter.new()
	c.data = {
		"v": 1, "id": "charter-" + Crypto.new().generate_random_bytes(6).hex_encode(),
		"name": charter_name, "hardcore": hardcore, "founded_at": Js.iso(Clock.now_ms()),
		"founder": founder_key, "sailed": false, "berths": [],
	}
	c.add_member(founder_key, captain_name)
	c.write()
	return c


static func open(id: String) -> Charter:
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(_path(id)))
	if not d is Dictionary:
		return null
	var c: Charter = Charter.new()
	c.data = d
	return c


func id() -> String:
	return data["id"]


func sailed() -> bool:
	return data.get("sailed", false) == true


func berth_of(key: String) -> Dictionary:
	for b: Dictionary in data["berths"]:
		if b["key"] == key:
			return b
	return {}


## Why this player cannot take a berth, or "" if they can (or already have one).
func refusal(key: String) -> String:
	if not berth_of(key).is_empty():
		return ""
	if sailed():
		return "This Charter has set sail. Its crew is fixed."
	if (data["berths"] as Array).size() >= BERTHS:
		return "Every berth in this Charter is taken."
	return ""


## A new member's Charter captain, in a new berth.
func add_member(key: String, captain_name: String) -> Session:
	var made: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(made["save"], made["carried"])
	var name_ok: String = captain_name.strip_edges()
	if name_ok != "":
		s.profile()["username"] = name_ok
	(data["berths"] as Array).append({ "key": key, "name": s.captain_name(), "captain": "" })
	sessions[key] = s
	s.writer = write
	write()
	return s


## A member's captain, opened from their berth.
func session_for(key: String) -> Session:
	if sessions.has(key):
		return sessions[key]
	var b: Dictionary = berth_of(key)
	if b.is_empty():
		return null
	var loaded: Dictionary = SaveFile.deserialize(b["captain"], Captains._species())
	if loaded.has("error"):
		push_error("a Charter captain would not open: %s" % loaded["error"])
		return null
	var s: Session = Session.new(loaded["save"], loaded["carried"])
	s.writer = write
	sessions[key] = s
	return s


func set_sail() -> void:
	data["sailed"] = true
	write()


## Every opened captain back into its berth, and the file written.
func write() -> void:
	for b: Dictionary in data["berths"]:
		var s: Session = sessions.get(b["key"])
		if s != null:
			b["captain"] = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
			b["name"] = s.captain_name()
	DirAccess.make_dir_recursive_absolute(_dir())
	var err: Error = SaveFile.write_file(ProjectSettings.globalize_path(_path(id())), JSON.stringify(data, " "))
	if err != OK:
		push_error("the Charter did not write: %s" % error_string(err))
