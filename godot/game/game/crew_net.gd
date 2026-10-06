class_name CrewNet
extends Node
## A CHARTER'S CREW ON THE WIRE (Godot port, the Charter slice).
##
## THE FOUNDER'S GAME RUNS THE WORLD (docs/systems/steam-port.md): every
## Charter captain lives in the founder's Charter file, so the founder's game
## rolls every die and writes every reward. A crewmate's game sends each action
## by name (RulesApi) and gets back the result and their save as it now stands;
## no two machines ever have to agree.
##
## Two transports, one protocol (Godot's high-level multiplayer):
##   Steam, when it is up: the founder opens a friends-only lobby, friends
##     join by invite or from Join Game, and GodotSteam's peer carries it
##     (Valve's relay, no server of ours);
##   the local network otherwise, on PORT, so two copies on one machine can
##     sail together while there is no App ID.
##
## The protocol:
##   hello(key, name)        crewmate -> founder, on connecting
##   welcome(info, captain)  founder -> crewmate: the Charter, and their captain
##   refused(why)            founder -> crewmate, then the line is dropped
##   roster(list)            founder -> all, whenever someone comes or goes
##   sail()                  founder -> all: the roster is locked, to the sea
##   req(n, op, args)        crewmate -> founder: one action
##   res(n, result, captain) founder -> crewmate: its answer and the save
##   boat(key, state)        anyone -> all, ten times a second, unreliable
##   look(key, name, look)   anyone -> all, when it changes

signal roster_changed(list: Array)
signal welcomed(info: Dictionary, session: Session)
signal refused_by_founder(why: String)
signal sailing
signal lost(why: String)
## The founder's own game is done with this Charter (sunk, or handed over).
signal ended(why: String)
signal mate_boat(key: String, state: Dictionary)
signal mate_look(key: String, mate_name: String, look: Dictionary)
signal mate_left(key: String)
## The crew is asked to agree to something (a prestige): its id, who asks,
## and what it means. Answer with vote().
signal proposed(id: int, by: String, text: String)
signal _voted(id: int)
signal _answered(n: int, result: Variant)

const PORT: int = 24650
## How long a crewmate waits on one action before giving up on it.
const REQUEST_WAIT: float = 20.0
const LOBBY_FRIENDS_ONLY: int = 1

var hosting: bool = false
var charter: Charter = null
var key: String = ""
var captain_name: String = ""
var lobby_id: int = 0
## On the founder's game: peer id -> member key, and who is in port.
var _members: Dictionary = {}
var _next: int = 0
var _open: Dictionary = {}
var _boat_t: float = 0.0
var _looks: Dictionary = {}


var tables: DenTables
var raids: RaidTable
var gauntlets: GauntletTable
var fishing: CrewFishing


func _ready() -> void:
	name = "CrewNet"
	tables = DenTables.new()
	add_child(tables)
	raids = RaidTable.new()
	add_child(raids)
	gauntlets = GauntletTable.new()
	add_child(gauntlets)
	fishing = CrewFishing.new()
	fishing.name = "CrewFishing"
	add_child(fishing)
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void: _drop("Could not reach the founder's game."))
	multiplayer.server_disconnected.connect(func() -> void: _drop("The founder has left port."))
	var steam: Object = SteamLayer.steam()
	if steam != null:
		steam.connect("lobby_created", _on_lobby_created)
		steam.connect("lobby_joined", _on_lobby_joined)
		steam.connect("join_requested", func(lobby: int, _who: int) -> void:
			# Not while running a Charter for a crew: joining another would drop
			# them all (Kong's audit, 2026-10-06).
			if hosting and multiplayer.multiplayer_peer != null:
				return
			join_lobby(lobby))


func _process(delta: float) -> void:
	if SteamLayer.up:
		SteamLayer.steam().call("run_callbacks")
	if _sink_due:
		# The fight that spent the last life plays out, and its end is seen.
		var quiet: bool = ["idle", "done"].has(str(raids._r.get("phase", "idle"))) and ["idle", "done"].has(str(gauntlets._r.get("phase", "idle")))
		_sink_wait = _sink_wait + delta if quiet else 0.0
		if _sink_wait >= SINK_AFTER:
			_sink_due = false
			_sink_now()


# ── A hardcore Charter sinks; a Charter handed over ───────────────────────────

const SINK_AFTER: float = 8.0
const CHUNK: int = 48000
var _sink_due: bool = false
var _sink_wait: float = 0.0
## What a crewmate is told when the founder's line closes, if the founder said
## why first (sunk, handed over).
var _end_note: String = ""
var _hand_parts: Array = []
var _hand_to: String = ""


func _on_sinking() -> void:
	_sink_due = true
	_sink_wait = 0.0


func _sink_now() -> void:
	var log: Array = Js.list(charter.data.get("lifeLog"))
	var last: Dictionary = Js.obj(log.back()) if not log.is_empty() else {}
	var why: String = "The %s has sunk. Its last life went down with %s. The Charter and its captains are gone." % [charter.data["name"], last.get("by", "a captain")]
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_farewell.rpc(why)
	charter.sink()
	await get_tree().create_timer(0.5).timeout
	leave()
	ended.emit(why)


@rpc("authority", "reliable")
func _farewell(why: String) -> void:
	_end_note = why


## The founder hands the whole Charter to a crewmate aboard now: the file goes
## across in parts, the crewmate's game writes it as its own, and this game's
## copy is put away. Everyone leaves port; the new founder hosts from the
## title screen.
func hand_over(to_key: String) -> String:
	if not hosting:
		return "Only the founder can hand the Charter over."
	var id: int = -1
	for p: Variant in _members:
		if _members[p] == to_key and int(p) != 1:
			id = int(p)
	if id < 0:
		return "They need to be aboard to take it."
	if not ["idle", "done"].has(str(raids._r.get("phase", "idle"))) or not ["idle", "done"].has(str(gauntlets._r.get("phase", "idle"))):
		return "Not while the crew are in a fight."
	_hand_to = to_key
	var text: String = charter.handover_text(to_key)
	var parts: int = int(ceil(float(text.length()) / float(CHUNK)))
	for i: int in parts:
		_hand_part.rpc_id(id, i, parts, text.substr(i * CHUNK, CHUNK))
	return ""


@rpc("authority", "reliable")
func _hand_part(i: int, parts: int, piece: String) -> void:
	if i == 0:
		_hand_parts = []
	_hand_parts.append(piece)
	if i < parts - 1:
		return
	var why: String = Charter.take_handover("".join(PackedStringArray(_hand_parts)), key)
	_hand_parts = []
	_handed.rpc_id(1, why)


@rpc("any_peer", "reliable")
func _handed(why: String) -> void:
	if not hosting:
		return
	var from: int = multiplayer.get_remote_sender_id()
	if _members.get(from) != _hand_to:
		return
	if why != "":
		push_error("a handover did not take: " + why)
		return
	var who: String = charter.berth_of(_hand_to).get("name", "your crewmate")
	var cname: String = str(charter.data["name"])
	for p: Variant in _members:
		if int(p) == 1:
			continue
		var mine: bool = _members[p] == _hand_to
		_farewell.rpc_id(int(p), "The %s is yours now. Host it from the title screen and your crew can join." % cname if mine else "%s has the %s now. Join them when they host it." % [who, cname])
	charter.handed_off()
	await get_tree().create_timer(0.5).timeout
	leave()
	ended.emit("You handed the %s to %s. They host it from now on." % [cname, who])


# ── Opening and joining ────────────────────────────────────────────────────────

## The founder opens the Charter's world to the crew.
func host(c: Charter) -> Error:
	_reset()
	charter = c
	hosting = true
	tables.charter = c
	c.tables = tables
	raids.charter = c
	c.raids = raids
	gauntlets.charter = c
	c.gauntlets = gauntlets
	fishing.charter = c
	c.fishing = fishing
	if not c.shared_changed.is_connected(_on_shared_changed):
		c.shared_changed.connect(_on_shared_changed)
	if not c.sinking.is_connected(_on_sinking):
		c.sinking.connect(_on_sinking)
	c.voter = ask_crew
	key = SteamLayer.player_key()
	var s: Session = c.session_for(key)
	captain_name = s.captain_name() if s != null else "Founder"
	_members[1] = key
	if SteamLayer.up:
		SteamLayer.steam().call("createLobby", LOBBY_FRIENDS_ONLY, Charter.BERTHS)
		return OK
	var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var err: Error = peer.create_server(PORT, Charter.BERTHS - 1)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	_send_roster()
	return OK


## A crewmate joins over the local network (no Steam).
func join_address(address: String, as_name: String) -> Error:
	_reset()
	hosting = false
	key = SteamLayer.player_key()
	captain_name = as_name
	var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var err: Error = peer.create_client(address, PORT)
	if err == OK:
		multiplayer.multiplayer_peer = peer
	return err


## A crewmate joins a Steam lobby (an invite, or Join Game).
func join_lobby(lobby: int, as_name: String = "") -> void:
	hosting = false
	key = SteamLayer.player_key()
	if as_name != "":
		captain_name = as_name
	elif captain_name == "":
		captain_name = SteamLayer.suggested_name()
	SteamLayer.steam().call("joinLobby", lobby)


func _reset() -> void:
	_members.clear()
	_looks.clear()
	_open.clear()
	_mine = null
	if tables != null:
		tables.charter = null
		tables.states.clear()


func _on_lobby_created(ok: int, lobby: int) -> void:
	if ok != 1:
		_drop("Steam would not open a lobby.")
		return
	lobby_id = lobby
	var steam: Object = SteamLayer.steam()
	steam.call("setLobbyData", lobby, "charter", charter.data["name"])
	var peer: Object = ClassDB.instantiate("SteamMultiplayerPeer")
	peer.call("create_host", 0)
	multiplayer.multiplayer_peer = peer
	SteamLayer.charter_name = str(charter.data["name"])
	SteamLayer.joinable(lobby)
	SteamLayer.presence_home()
	_send_roster()


func _on_lobby_joined(lobby: int, _perms: int, _locked: bool, response: int) -> void:
	if hosting:
		return
	if response != 1:
		_drop("That Charter's lobby would not let you in.")
		return
	lobby_id = lobby
	SteamLayer.charter_name = str(SteamLayer.steam().call("getLobbyData", lobby, "charter"))
	SteamLayer.joinable(lobby)
	SteamLayer.presence_home()
	var owner: int = int(SteamLayer.steam().call("getLobbyOwner", lobby))
	var peer: Object = ClassDB.instantiate("SteamMultiplayerPeer")
	peer.call("create_client", owner, 0)
	multiplayer.multiplayer_peer = peer


## Invite friends through the Steam overlay (Steam only).
func invite() -> void:
	if SteamLayer.up and lobby_id != 0:
		SteamLayer.steam().call("activateGameOverlayInviteDialog", lobby_id)


func leave() -> void:
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	if SteamLayer.up and lobby_id != 0:
		SteamLayer.steam().call("leaveLobby", lobby_id)
	lobby_id = 0
	SteamLayer.charter_name = ""
	SteamLayer.joinable(0)
	SteamLayer.presence_home()
	_fail_open("You left the Charter.")
	if charter != null and hosting:
		charter.flush()


func _drop(why: String) -> void:
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	if _end_note != "":
		why = _end_note
		_end_note = ""
	_fail_open(why)
	lost.emit(why)


func _fail_open(why: String) -> void:
	for n: Variant in _open.keys():
		_answered.emit(int(n), { "error": why })
	_open.clear()


# ── Who is aboard (the founder's side) ─────────────────────────────────────────

func _on_connected() -> void:
	_hello.rpc_id(1, key, captain_name)


func _on_peer_connected(_id: int) -> void:
	pass


func _on_peer_disconnected(id: int) -> void:
	if not hosting:
		return
	var k: Variant = _members.get(id)
	_members.erase(id)
	for n: Variant in _votes.keys():
		if k != null and _votes.has(n) and (_votes[n]["asked"] as Array).has(k):
			_tally(int(n), str(k), false)
	if k != null:
		raids.drop(str(k))
		gauntlets.drop(str(k))
		tables.drop(str(k))
		fishing.drop(str(k))
		mate_left.emit(k)
		_left.rpc(k)
		charter.write()
	_send_roster()


@rpc("any_peer", "reliable")
func _hello(k: String, as_name: String) -> void:
	if not hosting:
		return
	var id: int = multiplayer.get_remote_sender_id()
	var why: String = charter.refusal(k)
	# The same captain saying hello again (their game dropped and came back
	# before this one noticed): the old line is the stale one; let it go and
	# take the new (Kong's audit, 2026-10-06: they were refused for up to 30s).
	if why == "" and _members.values().has(k):
		for old: Variant in _members.keys():
			if _members[old] == k and int(old) != id and int(old) != 1:
				_on_peer_disconnected(int(old))
				if multiplayer.multiplayer_peer != null:
					multiplayer.multiplayer_peer.disconnect_peer(int(old))
		if _members.values().has(k):
			why = "That captain is already aboard."
	if why != "":
		_refused.rpc_id(id, why)
		await get_tree().create_timer(0.5).timeout
		if multiplayer.multiplayer_peer != null:
			multiplayer.multiplayer_peer.disconnect_peer(id)
		return
	var s: Session = charter.session_for(k)
	if s == null:
		s = charter.add_member(k, as_name)
	_members[id] = k
	_welcome.rpc_id(id, _info(), _ship(s))
	# What is going on at the tables now (a muster, a dive): the newcomer's
	# screens catch up at once rather than at the next change.
	raids.welcome(k, id)
	gauntlets.welcome(k, id)
	fishing.welcome(id)
	# What the newcomer should see at once: every ship's look.
	for other: Variant in _looks:
		var l: Array = _looks[other]
		_look.rpc_id(id, other, l[0], l[1])
	_send_roster()


func _info() -> Dictionary:
	return { "id": charter.id(), "name": charter.data["name"], "hardcore": charter.data.get("hardcore", false), "sailed": charter.sailed() }


func roster() -> Array:
	var out: Array = []
	if charter == null:
		return out
	var aboard: Array = _members.values()
	for b: Dictionary in charter.data["berths"]:
		out.append({ "key": b["key"], "name": b["name"], "aboard": aboard.has(b["key"]), "founder": b["key"] == charter.data["founder"] })
	return out


func _send_roster() -> void:
	var list: Array = roster()
	roster_changed.emit(list)
	if multiplayer.multiplayer_peer != null and multiplayer.get_peers().size() > 0:
		_roster.rpc(list)


## The founder locks the roster and everyone sails.
func set_sail() -> void:
	if not hosting:
		return
	charter.set_sail()
	_sail.rpc()
	sailing.emit()


@rpc("authority", "reliable")
func _welcome(info: Dictionary, captain: String) -> void:
	var loaded: Dictionary = SaveFile.deserialize(captain, Captains._species())
	if loaded.has("error"):
		_drop("Your captain would not open: %s" % loaded["error"])
		return
	var s: Session = Session.new(loaded["save"], loaded["carried"])
	s.remote = self
	welcomed.emit(info, s)


@rpc("authority", "reliable")
func _refused(why: String) -> void:
	refused_by_founder.emit(why)


@rpc("authority", "reliable")
func _roster(list: Array) -> void:
	roster_changed.emit(list)


@rpc("authority", "reliable")
func _sail() -> void:
	sailing.emit()


@rpc("authority", "reliable")
func _left(k: String) -> void:
	mate_left.emit(k)


# ── Actions (a crewmate's rules run on the founder's game) ─────────────────────

## Send one action to the founder and wait for its answer. Adopts the save the
## founder sends back before returning, so the screens read the new state.
func request(op: String, args: Array) -> Variant:
	if multiplayer.multiplayer_peer == null:
		return { "error": "The founder's game is not answering." }
	_next += 1
	var n: int = _next
	_open[n] = true
	_req.rpc_id(1, n, op, args)
	# Never wait forever (Kong's audit, 2026-10-06): an answer that has not come
	# in REQUEST_WAIT seconds (the founder's game hit an error, or the line is
	# hung) comes back as an error, and the screen carries on.
	get_tree().create_timer(REQUEST_WAIT).timeout.connect(func() -> void:
		if _open.has(n):
			_open.erase(n)
			_answered.emit(n, { "error": "The founder's game did not answer. Try again." }))
	while true:
		# A signal with two arguments awaits as an array of them.
		var pair: Array = await _answered
		if int(pair[0]) == n:
			return pair[1]
	return null


@rpc("any_peer", "reliable")
func _req(n: int, op: String, args: Array) -> void:
	if not hosting:
		return
	var id: int = multiplayer.get_remote_sender_id()
	var k: Variant = _members.get(id)
	var s: Session = charter.session_for(k) if k != null else null
	if s == null:
		_res.rpc_id(id, n, { "error": "You are not aboard this Charter." }, "")
		return
	var r: Variant = await charter.run(s, op, args)
	if r is String and r == "not ported":
		r = { "error": "That is not in this build yet." }
	s.persist()
	_res.rpc_id(id, n, r, _ship(s))


## A captain's save to send to their own game. The founder keeps no copy of
## the badge notices once they are on their way (the crewmate's game shows
## them and clears its own; kept here they came back with every save).
func _ship(s: Session) -> String:
	var text: String = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
	s.save.erase("badges_new")
	return text


@rpc("authority", "reliable")
func _res(n: int, result: Variant, captain: String) -> void:
	if not _open.has(n):
		return
	_open.erase(n)
	if captain != "":
		var s: Session = _mine
		if s != null:
			s.adopt(captain)
	_answered.emit(n, result)


## The founder's game: the shared book or purse changed. Every crewmate aboard
## except the one who acted (their answer carries it) is sent their save.
func _on_shared_changed(actor_key: String) -> void:
	if not hosting or multiplayer.multiplayer_peer == null:
		return
	for id: Variant in _members:
		var k: String = _members[id]
		if int(id) == 1 or k == actor_key:
			continue
		var s: Session = charter.session_for(k)
		if s == null:
			continue
		# A table (a raid, a dive, the Den) changes each captain's own rewards:
		# their whole save. One captain's action changes only what the crew
		# shares: just that.
		if actor_key == "":
			_sync.rpc_id(int(id), _ship(s))
		else:
			_sync_shared.rpc_id(int(id), _shared_slice(s))


## What the crew shares, as it stands in this captain's save (lent), to lay
## over their game's copy.
func _shared_slice(s: Session) -> Dictionary:
	var sv: Dictionary = {}
	for k: String in Charter.SHARED_SAVE:
		if s.save.has(k):
			sv[k] = s.save[k]
	var pf: Dictionary = {}
	for c: String in Charter.SHARED_PROFILE:
		pf[c] = s.profile().get(c)
	return { "save": sv, "profile": pf, "charter": s.save.get("charter", {}) }


@rpc("authority", "reliable")
func _sync_shared(slice: Dictionary) -> void:
	if _mine == null:
		return
	var sv: Dictionary = slice.get("save", {})
	for k: Variant in sv:
		_mine.save[k] = sv[k]
	var pf: Dictionary = slice.get("profile", {})
	for c: Variant in pf:
		_mine.profile()[c] = pf[c]
	_mine.save["charter"] = slice.get("charter", {})
	_mine.changed.emit()


@rpc("authority", "reliable")
func _sync(captain: String) -> void:
	if _mine != null:
		_mine.adopt(captain)
		_mine.changed.emit()


# ── Crew votes ─────────────────────────────────────────────────────────────────

var _votes: Dictionary = {}
var _vote_next: int = 0


## The founder's game asks everyone aboard but the proposer to agree. True if
## all of them do (or nobody else is aboard); false at the first "not now", or
## after a minute with no answer.
func ask_crew(proposer_key: String, text: String) -> bool:
	var asked: Array = []
	for id: Variant in _members:
		if _members[id] != proposer_key:
			asked.append(_members[id])
	if asked.is_empty():
		return true
	_vote_next += 1
	var n: int = _vote_next
	_votes[n] = { "asked": asked, "yes": [], "no": false, "done": false }
	var by: String = ""
	var ps: Session = charter.session_for(proposer_key)
	if ps != null:
		by = ps.captain_name()
	for id: Variant in _members:
		var k: String = _members[id]
		if k == proposer_key:
			continue
		if int(id) == 1:
			proposed.emit(n, by, text)
		else:
			_propose.rpc_id(int(id), n, by, text)
	var timer: SceneTreeTimer = get_tree().create_timer(60.0)
	timer.timeout.connect(func() -> void:
		if _votes.has(n) and not _votes[n]["done"]:
			_votes[n]["no"] = true
			_votes[n]["done"] = true
			_voted.emit(n))
	while not _votes[n]["done"]:
		var got: int = await _voted
		if got == n:
			break
	var ok: bool = not _votes[n]["no"]
	_votes.erase(n)
	return ok


@rpc("authority", "reliable")
func _propose(n: int, by: String, text: String) -> void:
	proposed.emit(n, by, text)


## Answer a vote (from either side).
func vote(n: int, yes: bool) -> void:
	if hosting:
		_tally(n, key, yes)
	else:
		_vote.rpc_id(1, n, yes)


@rpc("any_peer", "reliable")
func _vote(n: int, yes: bool) -> void:
	if hosting:
		_tally(n, str(_members.get(multiplayer.get_remote_sender_id(), "")), yes)


func _tally(n: int, k: String, yes: bool) -> void:
	if not _votes.has(n) or _votes[n]["done"]:
		return
	var v: Dictionary = _votes[n]
	if not yes:
		v["no"] = true
		v["done"] = true
	elif not (v["yes"] as Array).has(k):
		(v["yes"] as Array).append(k)
		v["done"] = (v["yes"] as Array).size() >= (v["asked"] as Array).size()
	if v["done"]:
		_voted.emit(n)


## The crewmate's own session, adopted into on each answer (set by the game).
var _mine: Session = null


func bind(s: Session) -> void:
	_mine = s


# ── The ships on the water ─────────────────────────────────────────────────────

## Ten times a second: where my boat is, how it moves, what the captain is doing.
func send_boat(delta: float, state: Dictionary) -> void:
	if hosting:
		fishing.note_pos(key, state)
	if multiplayer.multiplayer_peer == null or multiplayer.get_peers().is_empty():
		return
	_boat_t += delta
	if _boat_t < 0.1:
		return
	_boat_t = 0.0
	_boat.rpc(key, state)


func send_look(look: Dictionary, as_name: String) -> void:
	_looks[key] = [as_name, look]
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_look.rpc(key, as_name, look)


@rpc("any_peer", "unreliable_ordered")
func _boat(k: String, state: Dictionary) -> void:
	if hosting:
		fishing.note_pos(k, state)
	mate_boat.emit(k, state)


@rpc("any_peer", "reliable")
func _look(k: String, as_name: String, look: Dictionary) -> void:
	_looks[k] = [as_name, look]
	mate_look.emit(k, as_name, look)
