extends Node
## THE PLUMBING a Charter's crew tables share: the base of RaidTable
## (game/raid_table.gd) and GauntletTable (game/gauntlet_table.gd), which
## extend it by path. Split out of both on 2026-10-10: the two had copied this
## near line for line (the code review's coop-app-15), so a fix to one (the
## welcome back of a fled captain was one) had to be made twice.
##
## What lives here: the table's state and the wire (_push, _state), the round
## steps both play the same way (_step, _played, _plan, the drum, a screen
## leaving the fight), the muster's ready and leave, the invites, the crew's
## bounty moments, the AFK clock behind "Go on without them", and the shared
## halves of welcome (a captain back on the line) and drop (a line lost).
## What each table says for itself is asked through the hooks below (each one
## overridden by the tables; the bodies here are only the plain default).

signal changed(state: Dictionary)

const MAX_SEATS: int = 4
## How long a round's events may play before the table moves on regardless.
const PLAY: float = 25.0

## On the founder's game: the Charter the table belongs to.
var charter: Charter = null
## The latest state, as everyone sees it.
var state: Dictionary = {}
var _r: Dictionary = { "phase": "idle", "seq": 0 }
var _began_ms: int = 0


func hosting() -> bool:
	return charter != null


## Is anything under way (not idle, not done)? For CrewNet, which otherwise
## reads the table's private state.
func busy() -> bool:
	return not ["idle", "done"].has(str(_r.get("phase", "idle")))


## The Charter is left (CrewNet): whatever was on is gone with it, so a later
## Charter starts idle (a muster left standing refused every new call).
func reset() -> void:
	charter = null
	state = {}
	_r = { "phase": "idle", "seq": 0 }
	_phase_seen = ""


func _session(key: String) -> Session:
	return charter.session_for(key) if charter != null else null


# ── Hooks each table answers for itself ───────────────────────────────────────

## Has every screen still in played this round's events?
func _everyone_played() -> bool:
	return true


## After a round has played on every screen: what comes next.
func _advance() -> void:
	pass


## Resolve the round on the founder's game once every plan is in.
func _resolve() -> void:
	pass


## Why a crewmate aboard may not be invited ("" when they may).
func _invite_refusal(_s: Session) -> String:
	return ""


## The refusal for leaving once the muster is over.
func _under_way() -> String:
	return "Not now."


## A phase's clock ran out (_process): what moves on.
func _timed_out() -> void:
	if str(_r["phase"]) == "playing":
		_advance()


## What the muster adds to the state before it goes out (after the crew view).
func _muster_extras() -> void:
	pass


## The copy of the state that goes out on a push.
func _public() -> Dictionary:
	return _r.duplicate(true)


## The copy sent to one captain back on the line.
func _rejoin_copy() -> Dictionary:
	return _r.duplicate(true)


## Is this push sent over the wire (else straight to this game's screens)?
func _on_the_wire() -> bool:
	return multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty()


## A line has dropped and the captain is marked gone: is the table emptied,
## and what does the phase it was in now stop waiting for?
func _after_drop(_key: String) -> void:
	pass


# ── The muster ────────────────────────────────────────────────────────────────

func _ready_up(key: String, yes: bool) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "Not now." }
	for m: Dictionary in _r["members"]:
		if m["key"] == key:
			m["ready"] = yes
	_push()
	return { "ok": true }


func _leave(key: String) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": _under_way() }
	if _r.get("by") == key:
		_r["phase"] = "idle"
		_r["result"] = "called off"
	else:
		_r["members"] = (_r["members"] as Array).filter(func(m: Dictionary) -> bool: return m["key"] != key)
	_push()
	return { "ok": true }


# ── A round ───────────────────────────────────────────────────────────────────

func _seat_of(key: String) -> int:
	if not (_r.get("b") is Dictionary):
		return -1
	var seats: Array = _r["b"]["seats"]
	for i: int in seats.size():
		if seats[i].get("key") == key:
			return i
	return -1


## Move to a phase with this round's events; everyone plays them first.
func _step(next: String, ev: Array) -> void:
	_r["seq"] = int(_r["seq"]) + 1
	_r["ev"] = ev
	_r["acks"] = {}
	_r["after"] = next
	_r["phase"] = "playing"
	_r["left"] = PLAY
	_push()


func _played(key: String, seq: int) -> Dictionary:
	if _r["phase"] != "playing" or seq != int(_r["seq"]):
		return { "ok": true }
	_r["acks"][key] = true
	if _everyone_played():
		_advance()
	return { "ok": true }


## Sunk or got away: this screen has left the fight, so the rounds no longer
## wait on it.
func _out(key: String) -> Dictionary:
	if _r.has("gone"):
		_r["gone"][key] = true
		if _r["phase"] == "playing" and _everyone_played():
			_advance()
	return { "ok": true }


func _plan(key: String, plan: Dictionary) -> Dictionary:
	if _r["phase"] != "plan":
		return { "error": "Not now." }
	var si: int = _seat_of(key)
	if si < 0 or not Battle.alive(_r["b"]).has(_r["b"]["seats"][si]):
		return { "error": "You are out of this fight." }
	_r["plans"][key] = plan
	_push()
	if _all_planned():
		_resolve()
	return { "ok": true }


func _all_planned() -> bool:
	for s: Dictionary in Battle.alive(_r["b"]):
		if not _r["plans"].has(s["key"]):
			return false
	return true


func _drum(key: String) -> Dictionary:
	if _r["phase"] != "plan":
		return { "error": "Not now." }
	var si: int = _seat_of(key)
	if si < 0:
		return { "error": "You are out of this fight." }
	var r: Dictionary = Battle.use_drum(_r["b"], si)
	_push()
	return r


## A crew moment for the crew's bounty order, written down ONCE (in the first
## captain's record; the board reads the whole crew's): in a Charter with more
## than one captain in the line.
func _crew_moment(kind: String, value: float) -> void:
	if charter == null or (_r.get("members", []) as Array).size() < 2:
		return
	var k: String = str((_r["members"] as Array)[0]["key"])
	var s: Session = _session(k)
	if s == null:
		return
	Bounties.log_event(s.store, s.uid, kind, value)
	charter.write(k)


# ── The wire ──────────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	if not hosting():
		return
	if float(_r.get("left", -1.0)) <= 0.0:
		return
	_r["left"] = float(_r["left"]) - delta
	if float(_r["left"]) > 0.0:
		return
	_r["left"] = -1.0
	_timed_out()


## Send the state to everyone (and to this game's own screens).
func _push() -> void:
	_clock()
	if str(_r.get("phase", "")) == "muster":
		_r["crew"] = _crew_view()
		_muster_extras()
	var pub: Dictionary = _public()
	if _on_the_wire():
		_state.rpc(pub)
	else:
		_state(pub)


@rpc("authority", "call_local", "reliable")
func _state(pub: Dictionary) -> void:
	state = pub
	changed.emit(pub)


## GO ON WITHOUT THEM (Kong's audit, 2026-10-06: one captain gone to make tea
## held the whole crew). Once a choice has waited AFK_WAIT seconds, any
## captain still in can move it on: the ones not yet answered take the
## default (a ship holds and reloads, a curse is borne, a vote banks). The
## clock is the founder's, from when the choice opened.
const AFK_WAIT: float = 60.0
var _phase_ms: int = 0
var _phase_seen: String = ""


func _clock() -> void:
	var tag: String = "%s:%s:%s" % [_r.get("phase", ""), str(_r.get("seq", "")), str(Js.obj(_r.get("draft")).get("turn", ""))]
	if tag != _phase_seen:
		_phase_seen = tag
		_phase_ms = Time.get_ticks_msec()


func _waited() -> bool:
	return Time.get_ticks_msec() - _phase_ms >= int((AFK_WAIT - 5.0) * 1000.0)


# ── Invites (Kong, 2026-10-06: "an option to invite them and they get a
#    notification"; no sailing for them: they still sail there) ─────────────

## Who is aboard the Charter now ([{ key, name }]; CrewNet sets it).
var aboard: Callable = Callable()


## The crewmates aboard but not in the line: each with whether they can come
## ("" or why not) and what they said to an invite ("", asked, coming, no).
func _crew_view() -> Array:
	var out: Array = []
	if not aboard.is_valid():
		return out
	var inv: Dictionary = Js.obj(_r.get("invites"))
	for a: Dictionary in aboard.call():
		var k: String = str(a["key"])
		if (_r["members"] as Array).any(func(m: Dictionary) -> bool: return m["key"] == k):
			continue
		var s: Session = _session(k)
		out.append({ "key": k, "name": a["name"], "can": _invite_refusal(s) if s != null else "Not aboard.", "state": str(inv.get(k, "")) })
	return out


## A captain in the line asks a crewmate aboard to come.
func _invite(key: String, who: String) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "Not now." }
	if not (_r["members"] as Array).any(func(m: Dictionary) -> bool: return m["key"] == key):
		return { "error": "Only a captain in the line can ask." }
	var row: Dictionary = {}
	for c: Dictionary in _crew_view():
		if c["key"] == who:
			row = c
	if row.is_empty():
		return { "error": "They are not aboard." }
	if str(row["can"]) != "":
		return { "error": str(row["can"]) }
	if not _r.has("invites"):
		_r["invites"] = {}
	_r["invites"][who] = "asked"
	_push()
	return { "ok": true }


## An invited captain's answer: on their way, or not now.
func _answer(key: String, yes: bool) -> Dictionary:
	if _r["phase"] != "muster" or not Js.obj(_r.get("invites")).has(key):
		return { "ok": true }
	_r["invites"][key] = "coming" if yes else "no"
	_push()
	return { "ok": true }


# ── Lines lost and found ──────────────────────────────────────────────────────

## A captain back on the line mid-fight (their game dropped and came back):
## back in their seat, and shown where things are now. Only one whose LINE
## dropped (drop) comes back in: a captain who fled or sank left for good, and
## stays out.
func welcome(key: String, id: int) -> void:
	if str(_r.get("phase", "idle")) == "idle":
		return
	if Js.obj(_r.get("dropped")).has(key) and not ["muster", "done"].has(str(_r["phase"])):
		_r["dropped"].erase(key)
		_r["gone"].erase(key)
		var si: int = _seat_of(key)
		if si >= 0 and not _r["b"]["seats"][si].get("sunk", false):
			_r["b"]["seats"][si].erase("fled")
		_push()
		return
	if multiplayer.multiplayer_peer != null:
		_state.rpc_id(id, _rejoin_copy())


## A captain's game has dropped out of the Charter: out of the muster, or out
## of the line, and nothing waits on them (the table says what that moves on:
## _after_drop).
func drop(key: String) -> void:
	match str(_r["phase"]):
		"idle", "done":
			return
		"muster":
			_leave(key)
			return
	var si: int = _seat_of(key)
	# Out by the line alone (not already fled, sunk or gone): only such a
	# captain is let back in on a later hello (welcome).
	var was_out: bool = Js.obj(_r.get("gone")).has(key) or (si >= 0 and (_r["b"]["seats"][si].get("fled", false) or _r["b"]["seats"][si].get("sunk", false)))
	if not was_out:
		if not _r.has("dropped"):
			_r["dropped"] = {}
		_r["dropped"][key] = true
	if si >= 0:
		_r["b"]["seats"][si]["fled"] = true
	_r["gone"][key] = true
	_after_drop(key)
