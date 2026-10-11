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
##   the local network otherwise, on the first free port from PORT (PORTS of
##     them), so two copies on one machine can sail together while there is
##     no App ID.
##
## The protocol:
##   hello(key, name)        crewmate -> founder, on connecting
##   welcome(info, captain)  founder -> crewmate: the Charter, and their captain
##   refused(why)            founder -> crewmate, then the line is dropped
##   roster(list)            founder -> all, whenever someone comes or goes
##   bye()                   crewmate -> founder, just before leaving on purpose
##   sail()                  founder -> all: the roster is locked, to the sea
##   req(n, op, args)        crewmate -> founder: one action
##   res(n, result, captain, fresh) founder -> crewmate: its answer and the save
##   boat(key, state)        anyone -> all, ten times a second, unreliable
##   look(key, name, look)   anyone -> all, when it changes

signal roster_changed(list: Array)
signal welcomed(info: Dictionary, session: Session)
signal refused_by_founder(why: String)
signal sailing
signal lost(why: String)
## The founder's own game is done with this Charter (handed over).
signal ended(why: String)
## A hardcore Charter has sunk (its last life spent): every captain's game
## plays the ending and shows the end card (Charter.ending's facts).
signal sunk(summary: Dictionary)
signal mate_boat(key: String, state: Dictionary)
signal mate_look(key: String, mate_name: String, look: Dictionary)
signal mate_left(key: String)
## The same, saying how: "left" (pressed Leave) or "dropped" (the line was
## lost). Both fire; mate_left stays for whoever only needs the who.
signal mate_gone(key: String, how: String)
## A handover the crewmate's game could not take (the founder's sheet says so).
signal hand_failed(why: String)
## A crewmate's ping on the water (game/crew_pings.gd).
signal pinged(key: String, who: String, kind: String, at: Vector2)
## The crew is asked to agree to something (a prestige): its id, who asks,
## and what it means. Answer with vote().
signal proposed(id: int, by: String, text: String)
signal _voted(id: int)
signal _answered(n: int, result: Variant)

const PORT: int = 24650
## Hosting tries PORT and the next few (two copies on one machine, or another
## game here hosting, used to fail outright and found the Charter anyway).
const PORTS: int = 4
## How long a crewmate waits on one action before giving up on it.
const REQUEST_WAIT: float = 20.0
## How long the crew have to answer a vote (ask_crew).
const VOTE_WAIT: float = 60.0
## An action the founder's game may put to a crew vote first waits out the
## vote and then some: at REQUEST_WAIT the proposer was told it failed while
## the vote could still pass and the prestige run.
const VOTED_OPS: Array[String] = ["prestigeZone"]
const VOTED_WAIT: float = VOTE_WAIT + 15.0
const LOBBY_FRIENDS_ONLY: int = 1

var hosting: bool = false
var charter: Charter = null
var key: String = ""
var captain_name: String = ""
var lobby_id: int = 0
## The port this game hosts on (the local network), or 0.
var port: int = 0
## The address a crewmate is hailing ("" once welcomed): what a failed join
## names.
var hailing: String = ""
## The roster as last heard (both sides): who is aboard, and the founder's name.
var last_roster: Array = []
## A crewmate's game: the Charter as the founder's welcome gave it ({} until
## welcomed), what the founder said of how the line is ending ({} until then:
## kind "closed", "handed", "yours"; "lost" when they said nothing), and the
## sinking's end card once it came.
var joined_info: Dictionary = {}
var end_info: Dictionary = {}
var sunk_info: Dictionary = {}
## When the founder's game was last heard from (msec): a crewmate's sea says
## "Lost touch..." while the line is going quiet, before ENet gives up on it.
var heard_ms: int = 0
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
	raids.aboard = _aboard
	gauntlets.aboard = _aboard
	fishing = CrewFishing.new()
	fishing.name = "CrewFishing"
	add_child(fishing)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void:
		_drop("No founder answered at %s. Check the address and that they are in their harbour." % (hailing if hailing != "" else "that address")))
	multiplayer.server_disconnected.connect(func() -> void: _drop("Lost touch with %s's game." % founder_name()))
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
		var quiet: bool = not raids.busy() and not gauntlets.busy()
		_sink_wait = _sink_wait + delta if quiet else 0.0
		if _sink_wait >= SINK_AFTER:
			_sink_due = false
			_sink_now()


# ── A hardcore Charter sinks; a Charter handed over ───────────────────────────

## Once the fight that spent the last life is over, this long before the
## Charter goes down (it was 8 silent seconds; the ending is on the water now).
const SINK_AFTER: float = 2.5
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


## THE HARDCORE ENDING (Kong, 2026-10-11): every captain is sent the end
## card's facts and plays the ending on their own water (game/charter_cards.gd);
## the file moves to charters/sunk as before. The line stays up until each
## captain presses Back to port (the founder's leave then says nothing more:
## the crew already know), and nothing more is run on the Charter meanwhile.
func _sink_now() -> void:
	var summary: Dictionary = charter.ending()
	_farewelled = true
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_went_down.rpc(summary)
		_flush()
	charter.busy_why = "%s is lost." % summary["name"]
	charter.sink()
	sunk_info = summary
	sunk.emit(summary)


@rpc("authority", "reliable")
func _went_down(summary: Dictionary) -> void:
	sunk_info = summary
	Charter.forget(str(summary.get("id", "")))
	sunk.emit(summary)


## How the founder's line is ending, said before it closes (closed, handed).
@rpc("authority", "reliable")
func _ending(info: Dictionary) -> void:
	end_info = info


@rpc("authority", "reliable")
func _farewell(why: String) -> void:
	_end_note = why


## The founder has already told the crew why the line is closing (sunk,
## handed over), so leave() does not say it closed it.
var _farewelled: bool = false


## The founder's name, as the roster last said.
func founder_name() -> String:
	for m: Dictionary in last_roster:
		if m.get("founder", false):
			return str(m.get("name", "the founder"))
	return "the founder"


## What is queued goes out now: ENet clears its queues when a line closes, so
## a reliable message sent just before it was lost.
func _flush() -> void:
	var p: MultiplayerPeer = multiplayer.multiplayer_peer
	if p is ENetMultiplayerPeer and (p as ENetMultiplayerPeer).host != null:
		(p as ENetMultiplayerPeer).host.flush()


## The first port, given with --charter-port=N (tests run on a private one, so
## another run on this machine never lands in theirs), else PORT.
static func base_port() -> int:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--charter-port="):
			var n: int = int(a.trim_prefix("--charter-port="))
			if n > 0 and n < 65536 - PORTS:
				return n
	return PORT


## "192.168.1.39", "192.168.1.39:24651" or ":24651" -> [address, port]: the
## port is base_port() when none is given, -1 when it is not a port.
static func split_address(text: String) -> Array:
	var t: String = text.strip_edges()
	var at: int = t.rfind(":")
	# One colon only (an IPv6 address has many, and no port here).
	if at < 0 or t.count(":") > 1:
		return [t, base_port()]
	var host_part: String = t.left(at).strip_edges()
	var tail: String = t.substr(at + 1).strip_edges()
	var n: int = int(tail) if tail.is_valid_int() else -1
	if n <= 0 or n > 65535:
		n = -1
	return [host_part if host_part != "" else "127.0.0.1", n]


## The Charter is on its way to a crewmate (hand_over): until they answer,
## nothing more is applied here, since this copy is about to be put away and
## anything done meanwhile would never reach the new founder's copy.
var _handing: bool = false
const HANDING: String = "The Charter is changing hands."


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
	if raids.busy() or gauntlets.busy():
		return "Not while the crew are in a fight."
	_hand_to = to_key
	_handing = true
	charter.busy_why = HANDING
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
		_handing = false
		charter.busy_why = ""
		hand_failed.emit(why)
		return
	var who: String = charter.berth_of(_hand_to).get("name", "your crewmate")
	var cname: String = str(charter.data["name"])
	# Where the new founder can be hailed (as this game sees them; their game
	# hosts on the first free port, the usual one unless it is taken).
	var to_addr: String = ""
	var mp: MultiplayerPeer = multiplayer.multiplayer_peer
	if mp is ENetMultiplayerPeer and (mp as ENetMultiplayerPeer).get_peer(from) != null:
		to_addr = (mp as ENetMultiplayerPeer).get_peer(from).get_remote_address()
	for p: Variant in _members:
		if int(p) == 1:
			continue
		var mine: bool = _members[p] == _hand_to
		_ending.rpc_id(int(p), { "kind": "yours" if mine else "handed", "id": charter.id(), "charter": cname, "founder": captain_name, "to": who, "to_addr": to_addr })
		_farewell.rpc_id(int(p), "%s is yours now. Host it from the title screen and your crew can join." % cname if mine else "%s has %s now. Join them when they host it." % [who, cname])
	_farewelled = true
	# This game remembers it as a crewmate would: "Handed to Ben", with Rejoin.
	var me: Session = charter.session_for(key)
	Charter.remember(charter.id(), { "name": cname, "founder": who, "addr": to_addr, "captain": captain_name, "look": Skipper.look_of(me.profile()) if me != null else {}, "hardcore": charter.data.get("hardcore", false), "at": Time.get_unix_time_from_system(), "handed": true, "moved": false, "waiting": false })
	charter.handed_off()
	await get_tree().create_timer(0.5).timeout
	leave()
	ended.emit("You handed %s to %s. They host it from now on." % [cname, who])


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
	# The first free port of PORTS (another copy on this machine may hold one).
	for i: int in PORTS:
		var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
		if peer.create_server(base_port() + i, Charter.BERTHS - 1) == OK:
			port = base_port() + i
			multiplayer.multiplayer_peer = peer
			_send_roster()
			return OK
	# None free: nothing of this Charter is left half-hosted here.
	_unhost()
	return ERR_ALREADY_IN_USE


## Hosting failed before any line opened: the tables and the Charter let go.
func _unhost() -> void:
	if charter != null:
		if charter.shared_changed.is_connected(_on_shared_changed):
			charter.shared_changed.disconnect(_on_shared_changed)
		if charter.sinking.is_connected(_on_sinking):
			charter.sinking.disconnect(_on_sinking)
		charter.close()
	charter = null
	hosting = false
	port = 0
	_reset()


## A crewmate joins over the local network (no Steam). The address may carry
## a port ("192.168.1.39:24651"); without one, the first port.
func join_address(address: String, as_name: String) -> Error:
	_reset()
	hosting = false
	key = SteamLayer.player_key()
	captain_name = as_name
	hailing = address.strip_edges()
	var parts: Array = split_address(address)
	if int(parts[1]) < 0 or str(parts[0]) == "":
		return ERR_INVALID_PARAMETER
	var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var err: Error = peer.create_client(str(parts[0]), int(parts[1]))
	if err == OK:
		multiplayer.multiplayer_peer = peer
	return err


## A crewmate joins a Steam lobby (an invite, or Join Game).
func join_lobby(lobby: int, as_name: String = "") -> void:
	_reset()
	hosting = false
	key = SteamLayer.player_key()
	if as_name != "":
		captain_name = as_name
	elif captain_name == "":
		captain_name = SteamLayer.suggested_name()
	SteamLayer.steam().call("joinLobby", lobby)


func _reset() -> void:
	_members.clear()
	_leaving.clear()
	last_roster = []
	_farewelled = false
	_end_note = ""
	joined_info = {}
	end_info = {}
	sunk_info = {}
	heard_ms = 0
	_looks.clear()
	_open.clear()
	_answering.clear()
	_skipped.clear()
	_mine = null
	_reset_tables()


## Every table back to idle with no Charter: a raid, a dive, a Den countdown or
## a derby left running on the last Charter must not refuse, tick on or finish
## into the next one.
func _reset_tables() -> void:
	if tables != null:
		tables.reset()
	if raids != null:
		raids.reset()
	if gauntlets != null:
		gauntlets.reset()
	if fishing != null:
		fishing.reset()


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
	# A vote still open ends as "not now" (its line is going), so the action
	# waiting on it answers before the line closes.
	_end_votes()
	# A hardcore Charter whose last life is spent sinks now, not after this
	# game has moved on (its farewell has no line to go down; ended must never
	# fire on a solo game later).
	if _sink_due and hosting and charter != null:
		charter.sink()
	_sink_due = false
	_sink_wait = 0.0
	var mp: MultiplayerPeer = multiplayer.multiplayer_peer
	var line_up: bool = mp != null and mp.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED and not multiplayer.get_peers().is_empty()
	if line_up and hosting and not _farewelled and charter != null:
		# The crew hear who closed it, and that their captains are safe in it.
		_ending.rpc({ "kind": "closed", "id": charter.id(), "charter": str(charter.data["name"]), "founder": captain_name })
		_farewell.rpc("%s closed %s. Your captain is safe aboard it; rejoin when %s hosts again." % [captain_name, charter.data["name"], captain_name])
		_flush()
	elif line_up and not hosting:
		# The founder hears this was on purpose (not a lost line).
		_bye.rpc_id(1)
		_flush()
	if multiplayer.multiplayer_peer != null:
		var old: MultiplayerPeer = multiplayer.multiplayer_peer
		multiplayer.multiplayer_peer = null
		if line_up and old is ENetMultiplayerPeer:
			_linger(old)
		else:
			old.close()
	if SteamLayer.up and lobby_id != 0:
		SteamLayer.steam().call("leaveLobby", lobby_id)
	lobby_id = 0
	SteamLayer.charter_name = ""
	SteamLayer.joinable(0)
	SteamLayer.presence_home()
	_fail_open("You left the Charter.")
	if charter != null and hosting:
		charter.flush()
		charter.close()
	_hand_parts = []
	_hand_to = ""
	_handing = false
	_farewelled = false
	hosting = false
	port = 0
	hailing = ""
	charter = null
	_answering.clear()
	_skipped.clear()
	_reset_tables()


## A line closed on purpose is kept open a moment longer, out of the game's
## hands (this game is already done with it), so the last words (who closed
## it, a crewmate's bye) are read before the line is seen to close: a packet
## arriving with the close was dropped, and the crew were told the founder's
## game was lost when they had closed the Charter (2026-10-11).
const LINGER: float = 0.6


func _linger(old: MultiplayerPeer) -> void:
	var t: float = 0.0
	while t < LINGER:
		old.poll()
		await get_tree().create_timer(0.05).timeout
		t += 0.05
	old.close()


func _drop(why: String) -> void:
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	if _end_note != "":
		why = _end_note
		_end_note = ""
	# A crewmate aboard whose founder said nothing first: their game was lost.
	if not hosting and end_info.is_empty() and not joined_info.is_empty():
		end_info = { "kind": "lost", "id": str(joined_info.get("id", "")), "charter": str(joined_info.get("name", "the Charter")), "founder": founder_name() }
	_fail_open(why)
	lost.emit(why)


func _fail_open(why: String) -> void:
	for n: Variant in _open.keys():
		_answered.emit(int(n), { "error": why })
	_open.clear()


# ── Who is aboard (the founder's side) ─────────────────────────────────────────

func _on_connected() -> void:
	_hello.rpc_id(1, key, captain_name)


func _on_peer_disconnected(id: int) -> void:
	if not hosting:
		return
	var k: Variant = _members.get(id)
	_members.erase(id)
	var how: String = "left" if _leaving.has(id) else "dropped"
	_leaving.erase(id)
	for n: Variant in _votes.keys():
		if k != null and _votes.has(n) and (_votes[n]["asked"] as Array).has(k):
			_tally(int(n), str(k), false)
	if k != null:
		raids.drop(str(k))
		gauntlets.drop(str(k))
		tables.drop(str(k))
		fishing.drop(str(k))
		# A drop mid-fight goes out in every phase, so no screen keeps waiting
		# on (and showing as choosing) a captain who is gone: a table's drop
		# pushes only some phases itself (the plan phase did not).
		if raids.busy():
			raids._push()
		if gauntlets.busy():
			gauntlets._push()
		mate_left.emit(k)
		mate_gone.emit(k, how)
		_left.rpc(k, how)
		charter.write()
	_send_roster()


## Crewmates (peer ids) who said they are leaving on purpose (bye).
var _leaving: Dictionary = {}


@rpc("any_peer", "reliable")
func _bye() -> void:
	if hosting:
		_leaving[multiplayer.get_remote_sender_id()] = true


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
	_leaving.erase(id)
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
	# With the founder's name: a crewmate's game remembers whose it is.
	var founder: String = str(charter.berth_of(str(charter.data.get("founder", ""))).get("name", captain_name))
	return { "id": charter.id(), "name": charter.data["name"], "hardcore": charter.data.get("hardcore", false), "sailed": charter.sailed(), "founder": founder }


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
	last_roster = list
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
	hailing = ""
	joined_info = info
	heard_ms = Time.get_ticks_msec()
	welcomed.emit(info, s)


@rpc("authority", "reliable")
func _refused(why: String) -> void:
	refused_by_founder.emit(why)


@rpc("authority", "reliable")
func _roster(list: Array) -> void:
	heard_ms = Time.get_ticks_msec()
	last_roster = list
	roster_changed.emit(list)


@rpc("authority", "reliable")
func _sail() -> void:
	sailing.emit()


@rpc("authority", "reliable")
func _left(k: String, how: String) -> void:
	mate_left.emit(k)
	mate_gone.emit(k, how)


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
	# hung) comes back as an error, and the screen carries on. One the crew may
	# vote on first waits out the vote.
	var wait: float = VOTED_WAIT if VOTED_OPS.has(op) else REQUEST_WAIT
	get_tree().create_timer(wait).timeout.connect(func() -> void:
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
		_res.rpc_id(id, n, { "error": "You are not aboard this Charter." }, "", false)
		return
	if _handing:
		_res.rpc_id(id, n, { "error": HANDING }, "", false)
		return
	# While this answer is on its way, a table settling sends this captain no
	# separate save: the answer carries it (_on_shared_changed).
	_answering[k] = int(_answering.get(k, 0)) + 1
	var r: Variant = await charter.run(s, op, args)
	if r is String and r == "not ported":
		r = { "error": "That is not in this build yet." }
	_answering[k] = int(_answering.get(k, 1)) - 1
	if int(_answering[k]) <= 0:
		_answering.erase(k)
	# Left the Charter while it ran (a vote ended by leave()): no line to answer on.
	if not hosting or multiplayer.multiplayer_peer == null:
		return
	s.persist()
	var fresh: bool = _skipped.has(k) and not _answering.has(k)
	if fresh:
		_skipped.erase(k)
	_res.rpc_id(id, n, r, _ship(s), fresh)


## Who is aboard now, by name (for the tables' invites).
func _aboard() -> Array:
	var out: Array = []
	if charter == null:
		return out
	for id: Variant in _members:
		var k: String = _members[id]
		out.append({ "key": k, "name": str(charter.berth_of(k).get("name", "A crewmate")) })
	return out


## A captain's save to send to their own game. The founder keeps no copy of
## the badge notices once they are on their way (the crewmate's game shows
## them and clears its own; kept here they came back with every save).
func _ship(s: Session) -> String:
	var text: String = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
	s.save.erase("badges_new")
	return text


## Crewmates with an action being answered now (key -> how many), and those
## a table's save was held back from meanwhile (their answer then says so,
## and their screens refresh as a _sync would have made them).
var _answering: Dictionary = {}
var _skipped: Dictionary = {}


@rpc("authority", "reliable")
func _res(n: int, result: Variant, captain: String, fresh: bool) -> void:
	heard_ms = Time.get_ticks_msec()
	# A late answer (given up on at the wait) still brings the save as it now
	# stands: a vote that ran long may have passed and changed it.
	if captain != "" and _mine != null:
		_mine.adopt(captain)
		if fresh or not _open.has(n):
			_mine.changed.emit()
	if not _open.has(n):
		return
	_open.erase(n)
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
			# Their action's answer is still to go, and carries the save.
			if _answering.has(k):
				_skipped[k] = true
				continue
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
	var timer: SceneTreeTimer = get_tree().create_timer(VOTE_WAIT)
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


## Every open vote ends as "not now" (leaving the Charter).
func _end_votes() -> void:
	for n: Variant in _votes.keys():
		if _votes.has(n) and not _votes[n]["done"]:
			_votes[n]["no"] = true
			_votes[n]["done"] = true
			_voted.emit(int(n))
	_votes.clear()


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


## A ping from this captain, to everyone aboard (and this game).
func send_ping(kind: String, at: Vector2) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.get_peers().is_empty():
		_ping(key, captain_name, kind, at.x, at.y)
	else:
		_ping.rpc(key, captain_name, kind, at.x, at.y)


@rpc("any_peer", "call_local", "reliable")
func _ping(k: String, who: String, kind: String, x: float, y: float) -> void:
	pinged.emit(k, who, kind, Vector2(x, y))


@rpc("any_peer", "unreliable_ordered")
func _boat(k: String, state: Dictionary) -> void:
	# Ten a second from every ship: the line is alive while they come.
	heard_ms = Time.get_ticks_msec()
	if hosting:
		fishing.note_pos(k, state)
	mate_boat.emit(k, state)


@rpc("any_peer", "reliable")
func _look(k: String, as_name: String, look: Dictionary) -> void:
	_looks[k] = [as_name, look]
	mate_look.emit(k, as_name, look)
