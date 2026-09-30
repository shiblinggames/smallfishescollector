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
## In a Charter: a crewmate's session is REMOTE, its actions run on the
## founder's game (CrewNet.request) and its save is a copy the founder sends
## back after each one. The founder's own session writes the Charter's file
## instead of a captain's (writer).
var remote: CrewNet = null
var writer: Callable = Callable()


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


## Every action on the captain goes through here, by its TS name (RulesApi):
## solo and on the founder's game it runs at once; a crewmate's is sent to the
## founder and awaited. Always `await session.act(...)`.
func act(op: String, args: Array = []) -> Variant:
	if remote != null:
		return await remote.request(op, args)
	return RulesApi.run(store, uid, op, args)


## A crewmate's copy of their save, replaced by the one the founder sends back.
## Updated in place, so the store and every screen holding the save or the
## profile keep pointing at the live one.
func adopt(text: String) -> void:
	var loaded: Dictionary = SaveFile.deserialize(text, save["species"])
	if loaded.has("error"):
		push_error("the founder sent a save that would not open: %s" % loaded["error"])
		return
	var fresh: Dictionary = loaded["save"]
	for k: Variant in save.keys():
		if not fresh.has(k):
			save.erase(k)
	for k: Variant in fresh:
		if save.get(k) is Dictionary and fresh[k] is Dictionary:
			(save[k] as Dictionary).clear()
			(save[k] as Dictionary).merge(fresh[k])
		else:
			save[k] = fresh[k]


func persist() -> void:
	if remote != null:
		return
	if writer.is_valid():
		writer.call()
		return
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
