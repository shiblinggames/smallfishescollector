extends RefCounted
## Part of GauntletTable (game/gauntlet_table.gd): HELD DIVES, written down at
## every breather and as each fight begins, held by the crew's vote, resumed
## by the same crew or given up. Split out of gauntlet_table.gd on 2026-10-10
## for size. Every function takes the table as `t` and works on its state
## (t._r); the table forwards to these under their old names, and other parts
## reach each other through those.

## Where held dives are kept: alone, in the captain's save; in a Charter, in
## the Charter's own file (the crew's).
static func held_all(t: GauntletTable) -> Dictionary:
	if t.charter != null:
		if not (t.charter.data.get("gauntletHeld") is Dictionary):
			t.charter.data["gauntletHeld"] = {}
		return t.charter.data["gauntletHeld"]
	if t.solo != null:
		var p: Dictionary = t.solo.profile()
		if not (p.get("gauntlet_held") is Dictionary):
			p["gauntlet_held"] = {}
		return p["gauntlet_held"]
	return {}


static func held_write(t: GauntletTable) -> void:
	if t.charter != null:
		t.charter.write()
	elif t.solo != null:
		t.solo.persist()


## What the entry screen shows of a held dive of this descent.
static func held_note(t: GauntletTable, variant: String) -> Dictionary:
	var h: Dictionary = Js.obj(held_all(t).get(variant))
	if h.is_empty():
		return {}
	return { "depth": h["depth"], "mode": h["mode"], "names": h["names"], "keys": h["keys"], "status": h["status"], "at": h["at"], "pot": h["pot"] }


## The dive written down as it stands at a breather.
static func checkpoint(t: GauntletTable, status: String, fight: Dictionary = {}) -> void:
	var run: Dictionary = t._r["run"].duplicate(true)
	run["peek"] = fight.duplicate(true)
	var seats: Array = []
	for st: Dictionary in t._r["b"]["seats"]:
		if t._keys_in().has(st.get("key")):
			var c: Dictionary = st.duplicate(true)
			c.erase("statuses")
			seats.append(c)
	var names: Dictionary = {}
	for k: String in t._keys_in():
		names[k] = Js.obj(run.get("names")).get(k, "A captain")
	held_all(t)[str(run["variant"])] = {
		"status": status, "at": Js.iso(Clock.now_ms()), "variant": run["variant"], "mode": run.get("mode", "solo"),
		"depth": float(int(run["roll"]["cleared"]) + int(run["skip"])), "pot": run["pot"], "keys": t._keys_in(), "names": names,
		"run": run, "caps": t._r["caps"].duplicate(true), "seats": seats,
		# The dive's time so far: a resumed dive's record counts all of it.
		"elapsed": float(Time.get_ticks_msec() - t._began_ms),
	}
	held_write(t)


static func held_clear(t: GauntletTable) -> void:
	if not t._r.has("run"):
		return
	held_all(t).erase(str(t._r["run"]["variant"]))
	held_write(t)


## Everyone voted to hold it: written down, and the crew go back up.
static func hold(t: GauntletTable) -> void:
	checkpoint(t, "held")
	t._r["result"] = "held"
	t._r["heldAt"] = float(int(t._r["run"]["roll"]["cleared"]) + int(t._r["run"]["skip"]))
	t._settle()
	t._enter("held")


## The caller picks the held dive (or a fresh one) at the muster.
static func resume_pick(t: GauntletTable, key: String, yes: bool) -> Dictionary:
	if t._r["phase"] != "muster" or t._r.get("by") != key:
		return { "error": "Only the captain who called it decides." }
	var h: Dictionary = Js.obj(t._r.get("held"))
	if yes and h.is_empty():
		return { "error": "There is no held dive here." }
	t._r["resume"] = yes
	if yes:
		t._r["mode"] = h["mode"]
	for m: Dictionary in t._r["members"]:
		m["ready"] = m["key"] == key
	t._push()
	return { "ok": true }


## The held dive, back where it was left: its breather, its crew, its pot.
static func resume(t: GauntletTable) -> Dictionary:
	var v: String = str(t._r["variant"])
	var h: Dictionary = Js.obj(held_all(t).get(v))
	if h.is_empty():
		return { "error": "There is no held dive here." }
	var here: Array = (t._r["members"] as Array).map(func(m: Dictionary) -> String: return str(m["key"]))
	var missing: Array = []
	for k: String in h["keys"]:
		if not here.has(k):
			missing.append(str(Js.obj(h["names"]).get(k, "a captain")))
	if not missing.is_empty():
		return { "error": "The held dive needs its whole crew: waiting on %s." % ", ".join(PackedStringArray(missing)) }
	for k2: String in here:
		if not (h["keys"] as Array).has(k2):
			return { "error": "%s was not in the held dive." % t._names().get(k2, "A captain") }
	t._r["run"] = (h["run"] as Dictionary).duplicate(true)
	t._r["caps"] = (h["caps"] as Dictionary).duplicate(true)
	var seats: Array = (h["seats"] as Array).duplicate(true)
	for st: Dictionary in seats:
		st["statuses"] = {}
	t._r["b"] = { "raidId": "", "gauntlet": v, "round": 0.0, "fight": 0.0, "seats": seats, "turn": 1.0, "state": "won", "events": [],
		"tier": "normal", "elites": {}, "bonusAffix": {}, "tides": [], "tideFired": [], "foes": [], "enemy": {}, "depth": h["depth"] }
	t._r["gone"] = {}
	t._r["fight"] = {}
	t._r["descent"] = {}
	# The clock picks up where the held dive left it (not from the resume).
	t._began_ms = Time.get_ticks_msec() - int(Js.num(h.get("elapsed", 0.0)))
	var mid: bool = str(h.get("status", "")) == "fighting" and not Js.obj(Js.obj(h["run"]).get("peek")).is_empty()
	t._step("refight" if mid else "breather", [{ "t": "resume", "depth": h["depth"] }])
	return { "ok": true }


## A held dive given up: each of its captains is paid their Fathoms, the pot
## is lost, it is gone.
static func end_held(t: GauntletTable, key: String) -> Dictionary:
	if t._r["phase"] != "muster" or t._r.get("by") != key:
		return { "error": "Only the captain who called it decides." }
	var v: String = str(t._r["variant"])
	var h: Dictionary = Js.obj(held_all(t).get(v))
	if h.is_empty():
		return { "error": "There is no held dive here." }
	if not (h["keys"] as Array).has(key):
		return { "error": "Only a captain of that dive can end it." }
	var keep_r: Dictionary = t._r
	var keep_began: int = t._began_ms
	# Its record carries the held dive's own time, not a leftover clock (a dive
	# held before the time was kept leaves the clock as it was).
	if h.has("elapsed"):
		t._began_ms = Time.get_ticks_msec() - int(Js.num(h["elapsed"]))
	t._r = { "run": h["run"], "caps": h["caps"], "phase": "muster" }
	var cd: int = int(h["depth"])
	for k: String in h["keys"]:
		var s: Session = t._session(k)
		if s == null:
			continue
		t._lend(s)
		t._death_pay(k, s, cd)
		t._take(s)
	t._r = keep_r
	t._began_ms = keep_began
	held_all(t).erase(v)
	held_write(t)
	t._settle()
	t._r["held"] = {}
	t._r["resume"] = false
	t._push()
	return { "ok": true }
