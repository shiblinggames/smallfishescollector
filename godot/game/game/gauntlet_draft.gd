extends RefCounted
## Part of GauntletTable (game/gauntlet_table.gd): THE DRAFT TABLE (the spread
## dealt, picked in turn, rerolled and banished, a personal draft's way back to
## the shrine or the Fence, a reprieve taken, a curse shed) and THE CODEX (a
## reaction or a synergy seen for the first time). Split out of
## gauntlet_table.gd on 2026-10-10 for size. Every function takes the table
## as `t` and works on its state (t._r); the table forwards to these under
## their old names, and other parts reach each other through those.

# ── The draft table ───────────────────────────────────────────────────────────

## A draft for the party (who = "") or one captain alone (a shrine's Blood
## Price, the Fence's Contraband, a job's reward). Returns false when every
## card is spent.
static func open_draft(t: GauntletTable, who: String, nd: int) -> bool:
	var run: Dictionary = t._r["run"]
	var keys: Array = [who] if who != "" else t._keys_in()
	if keys.is_empty():
		return false
	var solo_draft: bool = keys.size() == 1
	var tm: Dictionary = run["tm"]
	# Each captain's private synergy (a pair of their own boons).
	var syn: Dictionary = {}
	for k: String in keys:
		var c: Dictionary = t._r["caps"][k]
		var mult: float = float(tm["confluenceOfferMult"]) * Gauntlet.synergy_mult(c["ups"])
		var o: Dictionary = Gauntlet.draw_convergence(c["boons"], c["taken"], c["takenCv"], c["offeredCv"], mult, str(run["variant"])) if run["variant"] == "don" else {}
		if o.is_empty():
			o = Gauntlet.draw_confluence(c["boons"], c["taken"], c["offered"], mult, str(run["variant"]))
		if not o.is_empty():
			syn[k] = o
			(c["offeredCv"] if o.get("isConvergence", false) else c["offered"]).append(o["id"])
	var picks: int = int(tm["boonPicks"])
	var n: int = (maxi(1, picks - 1) if not syn.is_empty() else picks) if solo_draft else keys.size() + 2 - (1 if picks < 3 else 0)
	var cards: Array = deal(t, n, keys, [])
	# Co-op only: a bond power in place of the last card (at most one), and a
	# crew synergy for two captains who each hold half of one.
	if who == "" and keys.size() >= 2:
		var pc: Dictionary = Gauntlet.coop_cfg()
		if Dice.next() < float(pc.get("bondChance", 0.55)):
			var bd: Dictionary = Gauntlet.draw_bond(lowest(t, keys), Js.list(run["banned"]))
			if not bd.is_empty():
				bd["card"] = "boon"
				if not cards.is_empty():
					cards[cards.size() - 1] = bd
				else:
					cards.append(bd)
		var cs: Dictionary = crew_synergy(t, keys)
		if not cs.is_empty() and Dice.next() < float(pc.get("crewSynChance", 0.7)):
			cards.append(cs)
	if cards.is_empty() and syn.is_empty():
		return false
	# A reprieve card, when nobody was offered a synergy (it forgoes the pick).
	if syn.is_empty() and who == "" and not tm["noReprieves"] and nd >= Gauntlet.REPRIEVE_MIN_DEPTH and Dice.next() < Gauntlet.REPRIEVE_CHANCE:
		var rp: Dictionary = Gauntlet.draw_reprieve(Js.obj(run["curses"]).size()).duplicate()
		rp["card"] = "reprieve"
		cards.append(rp)
	# The order rotates each draft.
	var order: Array = keys.duplicate()
	var rot: int = int(run["drafts"]) % maxi(1, order.size())
	order = order.slice(rot) + order.slice(0, rot)
	run["drafts"] = float(run["drafts"]) + 1.0
	t._r["draft"] = {
		"cards": cards, "syn": syn, "order": order, "turn": 0.0, "stamps": {}, "took": {},
		"rerolls": {}, "personal": who != "", "title": "Paid in Blood" if who != "" else "Choose a Power",
	}
	t._enter("draft")
	return true


## Deal n family cards from the pool the party can still take (a family maxed
## for every captain in the draft is gone; a banished one never returns).
static func deal(t: GauntletTable, n: int, keys: Array, excl: Array) -> Array:
	var run: Dictionary = t._r["run"]
	var luck: float = 1.0
	var owned: Dictionary = {}
	for k: String in keys:
		var c: Dictionary = t._r["caps"][k]
		luck = maxf(luck, Gauntlet.boon_luck(c["ups"]))
	# A family is live while ANY captain here can still take a tier of it; the
	# draw sees it at its lowest held tier so it is offered at all.
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")):
		var lo: int = 99
		for k2: String in keys:
			lo = mini(lo, int(Js.num(Js.obj(t._r["caps"][k2]["boons"]).get(b["id"]))))
		if lo > 0:
			owned[b["id"]] = float(lo)
	var drawn: Array = Gauntlet.draw_boons(n, owned, luck, float(run["tm"]["commonSkew"]), str(run["variant"]), Js.list(run["banned"]) + excl)
	for d: Dictionary in drawn:
		d["card"] = "boon"
	return drawn


## The lowest tier any of these captains holds of every family (a family is
## live while anyone can still take a tier).
static func lowest(t: GauntletTable, keys: Array) -> Dictionary:
	var out: Dictionary = {}
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")) + Gauntlet.bonds():
		var lo: int = 99
		for k: String in keys:
			lo = mini(lo, int(Js.num(Js.obj(t._r["caps"][k]["boons"]).get(b["id"]))))
		if lo > 0:
			out[b["id"]] = float(lo)
	return out


## A crew synergy for this table: a synergy whose two powers two different
## captains hold one each (neither holds both, and the pair has not taken it).
static func crew_synergy(t: GauntletTable, keys: Array) -> Dictionary:
	var run: Dictionary = t._r["run"]
	var found: Array = []
	for c: Dictionary in Gauntlet.confluences():
		if not Gauntlet.in_pool(c.get("gauntlet"), str(run["variant"])):
			continue
		var h1: String = str(c["requires"][0]["boonId"])
		var h2: String = str(c["requires"][1]["boonId"])
		for a: String in keys:
			for b2: String in keys:
				if a == b2:
					continue
				var ca: Dictionary = t._r["caps"][a]["boons"]
				var cb: Dictionary = t._r["caps"][b2]["boons"]
				if Js.num(ca.get(h1)) >= 1.0 and Js.num(cb.get(h2)) >= 1.0 and Js.num(ca.get(h2)) < 1.0 and Js.num(cb.get(h1)) < 1.0 and not crew_has(t, str(c["id"]), a, b2):
					found.append([c, a, b2, mini(mini(int(ca[h1]), int(cb[h2])), Js.list(c["levels"]).size())])
	if found.is_empty():
		return {}
	var pick: Array = found[int(floor(Dice.next() * found.size()))]
	var cf: Dictionary = pick[0]
	var names: Dictionary = Js.obj(run.get("names"))
	return { "card": "crew", "id": cf["id"], "name": cf["name"], "keys": [pick[1], pick[2]], "level": float(pick[3]),
		"desc": Js.obj(Js.list(cf["levels"])[int(pick[3]) - 1]).get("desc", ""), "image": cf.get("image"),
		"names": [names.get(pick[1], "A captain"), names.get(pick[2], "A captain")] }


static func crew_has(t: GauntletTable, id: String, a: String, b2: String) -> bool:
	for x: Dictionary in Js.list(t._r["run"].get("crewSyn")):
		if x["id"] == id and Js.list(x["keys"]).has(a) and Js.list(x["keys"]).has(b2):
			return true
	return false


## The tier a captain would take of a family card (0: they hold it all).
static func next_tier(t: GauntletTable, key: String, fam: String) -> int:
	var b: Dictionary = Gauntlet.boon_def(fam)
	var nx: int = int(Js.num(Js.obj(t._r["caps"][key]["boons"]).get(fam))) + 1
	return nx if nx <= Js.list(b.get("tiers")).size() else 0


static func turn_key(t: GauntletTable) -> String:
	var d: Dictionary = t._r["draft"]
	var order: Array = d["order"]
	var i: int = int(d["turn"])
	return str(order[i]) if i < order.size() else ""


## A pick: { card: index } from the spread, or { syn: true } for one's own.
static func pick_card(t: GauntletTable, key: String, p: Dictionary) -> Dictionary:
	if t._r["phase"] != "draft":
		return { "error": "Not now." }
	if key != turn_key(t):
		return { "error": "Not your turn at the table." }
	var d: Dictionary = t._r["draft"]
	var c: Dictionary = t._r["caps"][key]
	var got: Dictionary = {}
	if p.get("syn", false) == true:
		var o: Dictionary = Js.obj(d["syn"].get(key))
		if o.is_empty():
			return { "error": "No synergy in your hand." }
		(c["takenCv"] if o.get("isConvergence", false) else c["taken"]).append(o["id"])
		got = { "kind": "syn", "id": o["id"], "name": o["name"], "level": o["level"] }
		mark_seen(t, key, str(o["id"]))
	else:
		var i: int = int(Js.num(p.get("card")))
		var cards: Array = d["cards"]
		if i < 0 or i >= cards.size() or d["stamps"].has(str(i)):
			return { "error": "That card is gone." }
		var card: Dictionary = cards[i]
		if card["card"] == "reprieve":
			got = take_reprieve(t, key, card)
		elif card["card"] == "crew":
			if not Js.list(card["keys"]).has(key):
				return { "error": "That crew synergy belongs to %s." % " and ".join(PackedStringArray(Js.list(card["names"]).map(func(x: Variant) -> String: return str(x)))) }
			if not t._r["run"].has("crewSyn"):
				t._r["run"]["crewSyn"] = []
			(t._r["run"]["crewSyn"] as Array).append({ "id": card["id"], "keys": card["keys"] })
			got = { "kind": "crew", "id": card["id"], "name": card["name"], "level": card["level"] }
			for k9: Variant in card["keys"]:
				mark_seen(t, str(k9), str(card["id"]))
		else:
			var tr: int = next_tier(t, key, str(card["id"]))
			if tr <= 0:
				return { "error": "You hold all of that power already." }
			c["boons"][card["id"]] = float(tr)
			got = { "kind": "boon", "id": card["id"], "name": card["name"], "tier": float(tr), "rarity": card["rarity"] }
		d["stamps"][str(i)] = key
	d["took"][key] = got
	d["turn"] = float(d["turn"]) + 1.0
	turn_on(t)
	return { "ok": true }


## The draft's turn passes on: past anyone with nothing they can take and
## anyone gone from the Charter (Kong's audit, 2026-10-06: a dropped captain
## next in line held the table forever); the draft closes after the last.
static func turn_on(t: GauntletTable) -> void:
	var d: Dictionary = t._r["draft"]
	while turn_key(t) != "" and (Js.obj(t._r.get("gone")).has(turn_key(t)) or not can_pick(t, turn_key(t))):
		d["took"][turn_key(t)] = { "kind": "none" }
		d["turn"] = float(d["turn"]) + 1.0
	if turn_key(t) == "":
		t._r["seq"] = int(t._r["seq"]) + 1
		t._push()
		draft_done(t)
		return
	t._push()


static func can_pick(t: GauntletTable, key: String) -> bool:
	var d: Dictionary = t._r["draft"]
	if not Js.obj(d["syn"].get(key)).is_empty():
		return true
	for i: int in (d["cards"] as Array).size():
		if d["stamps"].has(str(i)):
			continue
		var card: Dictionary = d["cards"][i]
		if card["card"] == "crew":
			if Js.list(card["keys"]).has(key):
				return true
			continue
		if card["card"] == "reprieve" or next_tier(t, key, str(card["id"])) > 0:
			return true
	return false


static func draft_done(t: GauntletTable) -> void:
	var personal: bool = t._r["draft"].get("personal", false)
	var back: String = str(t._r["draft"].get("back", ""))
	t._r.erase("draft")
	if personal and back == "shrine":
		t._r["phase"] = "shrine"
		t._shrine_check()
		return
	if personal and back == "fence":
		t._r["phase"] = "fence"
		t._fence_check()
		return
	t._chain()


static func take_reprieve(t: GauntletTable, key: String, card: Dictionary) -> Dictionary:
	var run: Dictionary = t._r["run"]
	var si: int = t._seat_of(key)
	var s: Dictionary = t._r["b"]["seats"][si]
	var out: Dictionary = { "kind": "reprieve", "id": card["id"], "name": card["name"] }
	match str(card["kind"]):
		"heal":
			var h: float = float(Js.round(float(s["max"]) * float(card["amount"]) * float(run["tm"]["healMult"])))
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + h)
			out["heal"] = h
		"crew":
			s["used"] = Js.list(t._r["caps"][key]["silenced"]).duplicate()
		"charges":
			s["carry"] = float(3 + (1 if Armory.has_rack(t._session(key).profile()) else 0))
		"cleanse":
			out["shed"] = shed_curse(t)
	return out


## A curse shed from the party (a reprieve, the Fence's Hex-Breaker); Dead
## Hands' silence lifts with it.
static func shed_curse(t: GauntletTable) -> String:
	var run: Dictionary = t._r["run"]
	var ids: Array = Js.obj(run["curses"]).keys()
	if ids.is_empty():
		return ""
	var id: String = str(ids[int(floor(Dice.next() * ids.size()))])
	run["curses"].erase(id)
	var want: int = Gauntlet.curse_silence(run["curses"])
	for s: Dictionary in t._r["b"]["seats"]:
		var cp: Dictionary = Js.obj(t._r["caps"].get(s["key"]))
		if cp.is_empty():
			continue
		while (cp["silenced"] as Array).size() > want:
			var freed: Variant = (cp["silenced"] as Array).pop_back()
			(s["used"] as Array).erase(freed)
	return str(Gauntlet.curse_def(id).get("name", id))


## The one at the table rerolls the cards left (a Locker reroll, per draft).
static func reroll(t: GauntletTable, key: String) -> Dictionary:
	if t._r["phase"] != "draft" or key != turn_key(t):
		return { "error": "Not your turn at the table." }
	var d: Dictionary = t._r["draft"]
	var used: int = int(Js.num(d["rerolls"].get(key)))
	if d.get("personal", false) or used >= Gauntlet.boon_rerolls(Js.list(t._r["caps"][key]["ups"])):
		return { "error": "No rerolls left." }
	d["rerolls"][key] = float(used + 1)
	var keep: Array = []
	var left: int = 0
	for i: int in (d["cards"] as Array).size():
		if d["stamps"].has(str(i)) or d["cards"][i]["card"] == "reprieve":
			keep.append(i)
		else:
			left += 1
	var fresh: Array = deal(t, left, d["order"], [])
	var k2: int = 0
	for i2: int in (d["cards"] as Array).size():
		if not keep.has(i2) and k2 < fresh.size():
			d["cards"][i2] = fresh[k2]
			k2 += 1
	t._push()
	return { "ok": true }


## Blacklist (Don's Locker): a card banished for the whole party's run, its
## place dealt again.
static func banish(t: GauntletTable, key: String, i: int) -> Dictionary:
	if t._r["phase"] != "draft" or key != turn_key(t):
		return { "error": "Not your turn at the table." }
	var c: Dictionary = t._r["caps"][key]
	var d: Dictionary = t._r["draft"]
	if float(c["filters"]) <= 0.0:
		return { "error": "No banishments left this run." }
	if i < 0 or i >= (d["cards"] as Array).size() or d["stamps"].has(str(i)) or d["cards"][i]["card"] != "boon":
		return { "error": "That card cannot be banished." }
	c["filters"] = float(c["filters"]) - 1.0
	(t._r["run"]["banned"] as Array).append(d["cards"][i]["id"])
	var shown: Array = (d["cards"] as Array).map(func(x: Dictionary) -> String: return str(x.get("id", "")))
	var fresh: Array = deal(t, 1, d["order"], shown)
	if fresh.is_empty():
		(d["cards"] as Array).remove_at(i)
		var st2: Dictionary = {}
		for k: String in d["stamps"]:
			st2[str(int(k) - (1 if int(k) > i else 0))] = d["stamps"][k]
		d["stamps"] = st2
	else:
		d["cards"][i] = fresh[0]
	t._push()
	return { "ok": true }


# ── The codex ─────────────────────────────────────────────────────────────────

## Reactions set off this round: each captain in the fight who had never
## seen one has it written into their Codex (gauntlet_reactions_seen), and
## the event names them so their screen can say it was discovered.
static func reactions_found(t: GauntletTable, ev: Array) -> void:
	for x: Variant in ev:
		if not (x is Dictionary) or str(x.get("t", "")) != "reaction":
			continue
		var fresh: Array = []
		for st: Dictionary in t._r["b"]["seats"]:
			var key: String = str(st.get("key", ""))
			var s: Session = t._session(key)
			if s == null:
				continue
			t._lend(s)
			if not Js.list(s.profile().get("gauntlet_reactions_seen")).has(x["id"]):
				s.store.add_to_list(s.uid, "gauntlet_reactions_seen", x["id"])
				fresh.append(key)
			t._take(s)
		x["new"] = fresh


## A synergy taken for the first time: into the captain's Codex.
static func mark_seen(t: GauntletTable, key: String, id: String) -> void:
	var s: Session = t._session(key)
	if s == null:
		return
	t._lend(s)
	var seen: Array = Js.list(s.profile().get("gauntlet_confluences_seen"))
	if not seen.has(id):
		s.store.add_to_list(s.uid, "gauntlet_confluences_seen", id)
	t._take(s)
