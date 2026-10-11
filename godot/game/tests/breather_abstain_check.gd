extends SceneTree
## THE IDLE CAPTAIN ABSTAINS (Kong, 2026-10-11): at a breather, when the crew
## press "Go on without them", a captain who had not voted casts nothing; the
## votes cast decide (a tie still banks). Before, the idle vote was cast as
## Bank, so one AFK captain in a pair always banked the dive. Also: the drop
## of a crewmate mid-fight is pushed to the screens in the plan phase, and
## pressing the maelstrom while a crewmate's dive gathers joins it.
##
##   godot --headless --path godot/game -s tests/breather_abstain_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _strong(s: Session) -> void:
	var p: Dictionary = s.store.me(s.uid)
	p["has_completed_practice_raid"] = true
	p["raid_node_progress"] = { "cleared": ["intro", Gauntlet.UNLOCK_NODE], "choices": {} }
	p["ship_tier"] = 6.0
	p["expedition_xp"] = 4000000.0
	p["raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]
	p["equipped_raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]


## Every captain answers whatever the table asks, except at a breather, until
## one comes up. Returns false if the dive ended first.
func _to_breather(t: GauntletTable, keys: Array, act: Callable) -> bool:
	var steps: int = 0
	var last_seq: int = -1
	while steps < 4000:
		steps += 1
		var st: Dictionary = t.state
		match str(st.get("phase", "")):
			"breather":
				return true
			"done", "idle", "haul", "dead":
				return false
			"playing":
				if int(st["seq"]) != last_seq:
					last_seq = int(st["seq"])
				for k: String in keys:
					await act.call(k, ["played", st["seq"]])
			"plan":
				var b: Dictionary = t._r["b"]
				for k2: String in keys:
					var si: int = t._seat_of(k2)
					if si < 0 or not Battle.alive(b).has(b["seats"][si]) or Js.obj(t._r["plans"]).has(k2):
						continue
					var lg: Dictionary = Battle.legal(b, b["seats"][si])
					await act.call(k2, ["plan", { "action": "volley" if lg["volley"] else ("fire" if lg["fire"] else "reload"), "aim": "critical", "target": 0.0 }])
			"flares":
				for k3: String in keys:
					await act.call(k3, ["flares", { "missed": 0.0, "feints": 0.0 }])
			"curse":
				for k4: String in keys:
					await act.call(k4, ["bear"])
			"draft":
				var who: String = t._turn_key()
				if who != "":
					await act.call(who, ["pick", { "syn": true }])
					for i: int in (st["draft"]["cards"] as Array).size():
						if str(t._r.get("phase", "")) != "draft" or t._turn_key() != who:
							break
						await act.call(who, ["pick", { "card": float(i) }])
			"shrine":
				for k5: String in keys:
					await act.call(k5, ["shrine", { "choice": "walk" }])
			"fence":
				for k6: String in keys:
					await act.call(k6, ["done"])
			"contract":
				for k7: String in keys:
					await act.call(k7, ["contract", 0.0])
			"jobResult":
				for k8: String in keys:
					await act.call(k8, ["home"])
			"marks":
				for k9: String in keys:
					await act.call(k9, ["mark", "shark"])
	return false


func _init() -> void:
	Captains.dir_override = "user://abstain_check_captains"
	Charter.dir_override = "user://abstain_check_charters"
	for dd: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(dd):
			for f: String in DirAccess.get_files_at(dd):
				DirAccess.remove_absolute("%s/%s" % [dd, f])
	await process_frame
	Dice.install(Dice.Mulberry32.new(11))
	seed(11)
	var c: Charter = Charter.found("Salt Ledger", false, "anna-key", "Anna")
	var a: Session = c.session_for("anna-key")
	var b: Session = c.add_member("ben-key", "Ben")
	var x: Session = c.add_member("cal-key", "Cal")
	for s: Session in [a, b, x]:
		_strong(s)
	var gt: GauntletTable = GauntletTable.new()
	root.add_child(gt)
	gt.charter = c
	c.gauntlets = gt
	var by_key: Dictionary = { "anna-key": a, "ben-key": b, "cal-key": x }
	var act: Callable = func(k: String, args: Array) -> Dictionary:
		var r: Variant = await c.run(by_key[k], "gauntletTable", args)
		return r if r is Dictionary else {}
	var at: Vector2 = GauntletTable.maelstrom_of("davy")
	var here: Dictionary = { "variant": "davy", "x": at.x, "y": at.y }

	# ── The maelstrom pressed during a crewmate's muster ──
	check(not (await act.call("anna-key", ["call", here])).has("error"), "Anna calls a dive")
	var solo_r: Dictionary = await act.call("ben-key", ["call", here])
	check(solo_r.has("error") and str(solo_r["error"]).contains("Anna is diving alone"), "a solo dive says who dives alone (%s)" % str(solo_r))
	await act.call("anna-key", ["mode", "coop"])
	check(not (await act.call("ben-key", ["call", here])).has("error"), "Ben's press at the maelstrom joins the co-op dive")
	check((gt._r["members"] as Array).size() == 2, "Ben is in the line")
	check(not (await act.call("ben-key", ["call", here])).has("error"), "a second press, already in the line, is nothing")
	await act.call("ben-key", ["ready", true])
	check(not (await act.call("anna-key", ["go"])).has("error"), "two dive")

	# ── A pair at a breather: Ben dives, Anna idles, Ben goes on without her ──
	var keys2: Array = ["anna-key", "ben-key"]
	if await _to_breather(gt, keys2, act):
		var depth0: int = int(gt._r["run"]["roll"]["cleared"])
		await act.call("ben-key", ["vote", "dive"])
		check(str(gt.state.get("phase", "")) == "breather", "the vote waits on Anna")
		check((await act.call("ben-key", ["nudge"])).has("error"), "not before the wait")
		gt._phase_ms -= 120000
		check(not (await act.call("ben-key", ["nudge"])).has("error"), "Ben goes on without her")
		check(str(gt._r.get("result", "")) != "banked" and str(gt._r.get("phase", "")) not in ["haul", "done"], "the dive goes on: Anna abstained, Ben's dive carried (phase %s)" % str(gt._r.get("phase", "")))
		check(Js.obj(gt._r.get("abstain")).has("anna-key"), "Anna is marked as abstaining")
		var af: Dictionary = Js.obj(gt._r.get("afk"))
		check(Js.list(af.get("keys")).has("anna-key") and str(af.get("what", "")) == "breather" and str(af.get("by", "")) == "Ben", "Anna is told the crew went on without her (%s)" % str(af))
		check(int(Js.num(Js.obj(gt._r.get("run")).get("roll", {}).get("cleared", 0))) >= depth0, "deeper, not banked")
	else:
		print("  (the pair's dive ended before a breather; seed it again)")
		bad += 1
	gt._r = { "phase": "idle", "seq": 0 }

	# ── Three at a breather: Ben dives, Cal banks, Anna idles: 1 to 1 banks ──
	await act.call("anna-key", ["call", here])
	await act.call("anna-key", ["mode", "coop"])
	await act.call("ben-key", ["join", here])
	await act.call("cal-key", ["join", here])
	await act.call("ben-key", ["ready", true])
	await act.call("cal-key", ["ready", true])
	await act.call("anna-key", ["go"])
	var keys3: Array = ["anna-key", "ben-key", "cal-key"]
	if await _to_breather(gt, keys3, act):
		await act.call("ben-key", ["vote", "dive"])
		await act.call("cal-key", ["vote", "bank"])
		gt._phase_ms -= 120000
		await act.call("ben-key", ["nudge"])
		check(str(gt._r.get("result", "")) == "banked", "a tie among the votes cast still banks (%s)" % str(gt._r.get("result", "")))
	else:
		print("  (the trio's dive ended before a breather; seed it again)")
		bad += 1
	gt._r = { "phase": "idle", "seq": 0 }

	# ── A drop in the plan phase is pushed ──
	await act.call("anna-key", ["call", here])
	await act.call("anna-key", ["mode", "coop"])
	await act.call("ben-key", ["join", here])
	await act.call("ben-key", ["ready", true])
	await act.call("anna-key", ["go"])
	var guard: int = 0
	while str(gt.state.get("phase", "")) != "plan" and guard < 50:
		guard += 1
		for k: String in keys2:
			await act.call(k, ["played", gt.state["seq"]])
	var pushes: Array = [0]
	gt.changed.connect(func(_st: Dictionary) -> void: pushes[0] += 1)
	gt.drop("ben-key")
	check(pushes[0] >= 1, "a drop in the plan phase goes out to the screens")
	check(Js.obj(gt.state.get("dropped")).has("ben-key"), "the state says Ben's game dropped")
	check(Js.obj(gt.rejoin_state("ben-key")).has("b"), "the table hands CrewNet the state for a captain back on the line")

	print("  breather abstain check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(1 if bad > 0 else 0)
