class_name Session
extends RefCounted
## THE CAPTAIN IN PLAY (Godot port, stage 1): their save, the store the rules
## read and write it through, and the write after every action.
##
## The dice are the save's own: seeded from the captain and the moment the
## session opened, as the desktop shell seeded them, so every roll the rules
## make goes through Dice.next() on a generator this session owns.

var save: Dictionary
var carried: Dictionary
var store: CaptainStore
var uid: String


func _init(s: Dictionary, c: Dictionary) -> void:
	save = s
	carried = c
	store = CaptainStore.new(save)
	uid = save["uid"]
	Dice.install(Dice.Mulberry32.new(Dice.seed_of("%s:%d" % [uid, int(Time.get_unix_time_from_system() * 1000.0)])))


## Open the most recently played captain, or start the first one.
static func open_latest() -> Session:
	for id: String in Captains.list():
		var loaded: Dictionary = Captains.open(id)
		if not loaded.has("error"):
			return Session.new(loaded["save"], loaded["carried"])
		push_warning("captain %s would not open: %s" % [id, loaded["error"]])
	var fresh: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(fresh["save"], fresh["carried"])
	s.persist()
	return s


func persist() -> void:
	var err: Error = Captains.write(save, carried)
	if err != OK:
		push_error("the save did not write: %s" % error_string(err))


func profile() -> Dictionary:
	return save["profile"]


func level() -> int:
	return Rules.level_from_xp(Js.num(profile().get("fishing_xp")))


func captain_name() -> String:
	return str(Js.nz(profile().get("username"), "Captain"))


## Baits held, in the shop's order: [[type, name, count]].
func baits() -> Array:
	var out: Array = []
	var held: Dictionary = save["bait"]
	for b: Dictionary in Rules.data()["baits"]:
		var n: float = Js.num(held.get(b["type"]))
		if n > 0:
			out.append([b["type"], b["name"], n])
	return out
