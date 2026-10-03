class_name Parlor
extends RefCounted
## THE PARLOR IN THE PORT (Kong, 2026-10-02 and 10-03): trivia from a shipped
## bank (content/trivia_bank.json, tools/build-trivia.mjs), dealt so a captain
## meets every question before any comes round again. Written for the port
## (no parity): the web's Parlor is weekly and server-generated, and the port's
## settled shape is not. Its tables are the web's (rules.json "parlor"):
## payouts, the answer clock, ranks, the King's prizes and havens, the
## capstan's wheel and strikes.
##
## THE CAPTAIN'S BOARD: a card is dealt every 8 real hours (10 sea days) into
## a hand that holds 3 (4 at Fishing 30, 5 at 60); a card is never lost, it
## waits. A card shows its topic and its worth face down; turning it over
## draws a question you have not seen, in that topic and tier, and starts its
## 12-second clock. Right pays the tier (50, 100, 200 ⟡) and Parlor points.
## THE PIRATE KING (Fishing 25): one run a week up ten rungs, easier to
## harder, the web's prizes, havens at 4 and 7, one 50/50, walk away banking
## the last prize. SPIN THE CAPSTAN: three phrases a week, the web's wheel,
## letters, vowels for 250 from the round's bank, three strikes. Points climb
## the web's ranks (their gem rewards are retired; what a rank grants instead
## is to be settled).

const DAY_MS: float = 86400000.0
static var _bank: Dictionary = {}
static var _by_id: Dictionary = {}


static func c() -> Dictionary:
	return Rules.data()["parlor"]


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("parlorPort"))


static func bank() -> Dictionary:
	if _bank.is_empty():
		_bank = JsJson.parse(FileAccess.get_file_as_string("res://content/trivia_bank.json"))
		for q: Dictionary in _bank["questions"]:
			_by_id[q["id"]] = q
	return _bank


static func question(qid: String) -> Dictionary:
	bank()
	return _by_id.get(qid, {})


static func _p(db: CaptainStore, uid: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	if not (prof.get("parlor") is Dictionary):
		prof["parlor"] = { "seen": [], "seen_phrases": [], "hand": [], "dealt_at": -1.0, "next_card": 1.0, "king": {}, "capstan": {} }
	return prof["parlor"]


static func _now() -> float:
	return Clock.now_ms()


static func week_key(now: float) -> String:
	var d: Dictionary = Time.get_datetime_dict_from_unix_time(int(now / 1000.0))
	var wd: int = (int(d["weekday"]) + 6) % 7
	return Js.iso(floor(now / DAY_MS) * DAY_MS - wd * DAY_MS).split("T")[0]


static func timed_out(revealed_at: float, now: float) -> bool:
	return revealed_at < 0.0 or now - revealed_at > float(c()["answerSeconds"]) * 1000.0 + float(c()["graceMs"])


static func hold_for(level: int) -> int:
	var n: int = 3
	for s: Array in Js.list(cfg().get("holdByLevel")):
		if level >= int(s[0]):
			n = int(s[1])
	return n


static func rank_of(points: float) -> Dictionary:
	var r: Dictionary = c()["ranks"][0]
	var nxt: Variant = null
	var ranks: Array = c()["ranks"]
	for i: int in ranks.size():
		if points >= float(ranks[i]["at"]):
			r = ranks[i]
			nxt = ranks[i + 1] if i + 1 < ranks.size() else null
	return { "rank": r, "next": nxt }


# ── Drawing from the bank ──────────────────────────────────────────────────────

## A question for this topic and tier, one this captain has not met, at
## random among those; failing that any unseen in the topic, then any unseen,
## then the one met longest ago.
static func _draw(p: Dictionary, category: String, tier: int) -> Dictionary:
	var seen: Dictionary = {}
	for s: Variant in p["seen"]:
		seen[s] = true
	var qs: Array = bank()["questions"]
	for step: int in 3:
		var pool: Array = qs.filter(func(q: Dictionary) -> bool:
			if seen.has(q["id"]):
				return false
			if step == 0:
				return (category == "" or q["category"] == category) and int(q["tier"]) == tier
			if step == 1:
				return category == "" or q["category"] == category
			return true)
		if not pool.is_empty():
			return pool[int(floor(Dice.next() * pool.size()))]
	# The bank is spent: start round again from the longest ago.
	var first: String = str((p["seen"] as Array).pop_front())
	return question(first)


static func _mark_seen(p: Dictionary, qid: String) -> void:
	var s: Array = p["seen"]
	s.erase(qid)
	s.append(qid)


# ── The Captain's Board ────────────────────────────────────────────────────────

## Cards dealt since the last look, up to the hand's size. A new captain is
## dealt one at once.
static func _deal(db: CaptainStore, uid: String, p: Dictionary) -> void:
	var now: float = _now()
	var every: float = float(cfg().get("dealMs", 28800000.0))
	var cap: int = hold_for(Rules.level_from_xp(Js.num(db.me(uid).get("fishing_xp"))))
	if float(p["dealt_at"]) < 0.0:
		p["dealt_at"] = now - every
	var hand: Array = p["hand"]
	while now - float(p["dealt_at"]) >= every:
		if hand.size() >= cap:
			p["dealt_at"] = now
			break
		p["dealt_at"] = float(p["dealt_at"]) + every
		var cats: Array = (c()["categories"] as Array).map(func(x: Dictionary) -> String: return x["key"])
		var r: float = Dice.next()
		var w: Array = Js.list(cfg().get("tierWeights"))
		var tier: int = 1 if r < float(w[0]) else (2 if r < float(w[0]) + float(w[1]) else 3)
		var n: float = Js.num(p.get("next_card"))
		p["next_card"] = n + 1.0
		hand.append({ "key": "c%d" % int(n), "category": cats[int(floor(Dice.next() * cats.size()))], "tier": float(tier) })


static func board(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = _p(db, uid)
	_deal(db, uid, p)
	var cap: int = hold_for(Rules.level_from_xp(Js.num(db.me(uid).get("fishing_xp"))))
	var every: float = float(cfg().get("dealMs", 28800000.0))
	var hand: Array = []
	for card: Dictionary in p["hand"]:
		var out: Dictionary = { "key": card["key"], "category": card["category"], "tier": card["tier"], "value": c()["tierValues"][int(card["tier"]) - 1] }
		if card.has("qid"):
			var q: Dictionary = question(card["qid"])
			out["question"] = q.get("question")
			out["options"] = q.get("options")
			out["revealedAt"] = card["revealed_at"]
		hand.append(out)
	return {
		"hand": hand, "hold": cap,
		"nextIn": -1.0 if hand.size() >= cap else maxf(0.0, every - (_now() - float(p["dealt_at"]))),
		"serverNow": _now(),
	}


static func board_reveal(db: CaptainStore, uid: String, key: String) -> Dictionary:
	var p: Dictionary = _p(db, uid)
	for card: Dictionary in p["hand"]:
		if card.has("qid") and card["key"] != key:
			return { "error": "Answer the card you already turned over first." }
	for card: Dictionary in p["hand"]:
		if card["key"] == key:
			if not card.has("qid"):
				var q: Dictionary = _draw(p, card["category"], int(card["tier"]))
				card["qid"] = q["id"]
				card["revealed_at"] = _now()
				_mark_seen(p, q["id"])
			return board(db, uid)
	return { "error": "That card is not in your hand." }


static func board_answer(db: CaptainStore, uid: String, key: String, chosen: float) -> Dictionary:
	if chosen < -1.0 or chosen > 3.0:
		return { "error": "Invalid answer" }
	var p: Dictionary = _p(db, uid)
	var card: Dictionary = {}
	for cd: Dictionary in p["hand"]:
		if cd["key"] == key:
			card = cd
	if card.is_empty() or not card.has("qid"):
		return { "error": "Choose your card first" }
	var q: Dictionary = question(card["qid"])
	var timed: bool = chosen == -1.0 or timed_out(float(card["revealed_at"]), _now())
	var right: bool = not timed and int(chosen) == int(q["correct_index"])
	(p["hand"] as Array).erase(card)
	var value: float = float(c()["tierValues"][int(card["tier"]) - 1])
	var won: float = value if right else 0.0
	var out: Dictionary = _score(db, uid, right, minf(float(card["tier"]), 2.0) if right else 0.0)
	if won > 0.0:
		db.bump_stat(uid, "doubloons", won)
		db.ledger(uid, won, "Captain's Board: %s for %d ⟡" % [_label(str(card["category"])), int(value)])
	out.merge({ "correct": right, "timedOut": timed, "correctIndex": q["correct_index"], "explanation": q.get("explanation", ""), "doubloonsWon": won, "newDoubloons": Js.num(db.me(uid).get("doubloons")) })
	return out


static func _label(cat: String) -> String:
	for x: Dictionary in c()["categories"]:
		if x["key"] == cat:
			return str(x["label"])
	return cat


## The streak (shared by the Board and the King) and the points.
static func _score(db: CaptainStore, uid: String, right: bool, points: float) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var prev: float = Js.num(prof.get("parlor_streak"))
	var best: float = Js.num(prof.get("parlor_best_streak"))
	var cur: float = prev + 1.0 if right else 0.0
	var pts0: float = Js.num(prof.get("parlor_points"))
	var pts1: float = pts0 + points
	db.update_profile(uid, { "parlor_streak": cur, "parlor_best_streak": maxf(best, cur), "parlor_points": pts1 })
	Skins.sync_parlor(db, uid)
	return {
		"currentStreak": cur, "brokeStreak": 0.0 if right else prev, "bestStreak": maxf(best, cur),
		"pointsEarned": points, "newPoints": pts1,
		"rankedUp": rank_of(pts0)["rank"]["title"] != rank_of(pts1)["rank"]["title"],
	}


# ── The Pirate King ────────────────────────────────────────────────────────────

const KING_TIERS: Array = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]


static func _king(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = _p(db, uid)
	var wk: String = week_key(_now())
	var k: Dictionary = Js.obj(p.get("king"))
	if k.get("week") != wk:
		k = { "week": wk, "rung": 0.0, "status": "active", "fifty": null, "started_at": -1.0, "awarded": 0.0, "ladder": [] }
		p["king"] = k
	return k


static func king(db: CaptainStore, uid: String) -> Dictionary:
	var gate: String = Rules.gate_block("feature", "parlor_king", Js.num(db.me(uid).get("fishing_xp")))
	var k: Dictionary = _king(db, uid)
	var out: Dictionary = { "week": k["week"], "status": k["status"], "rung": k["rung"], "awarded": k["awarded"], "fiftyUsed": k["fifty"] != null, "locked": gate, "prizes": c()["kingPrizes"], "havens": c()["kingHavens"] }
	if k["status"] == "active" and float(k["started_at"]) >= 0.0:
		out["current"] = _king_q(k)
		out["startedAt"] = k["started_at"]
	return out


static func _king_q(k: Dictionary) -> Dictionary:
	var r: int = int(k["rung"])
	var q: Dictionary = question(str(k["ladder"][r]))
	var removed: Array = (k["fifty"] as Dictionary)["removed"] if k["fifty"] is Dictionary and int(k["fifty"]["rung"]) == r else []
	return { "question": q["question"], "options": q["options"], "removed": removed, "category": q["category"], "tier": q["tier"] }


static func king_start(db: CaptainStore, uid: String) -> Dictionary:
	var gate: String = Rules.gate_block("feature", "parlor_king", Js.num(db.me(uid).get("fishing_xp")))
	if gate != "":
		return { "error": gate }
	var k: Dictionary = _king(db, uid)
	if k["status"] != "active":
		return { "error": "The run is over for this week" }
	var r: int = int(k["rung"])
	if (k["ladder"] as Array).size() <= r:
		# A rung of its tier, any topic, one not met before.
		var p: Dictionary = _p(db, uid)
		var q: Dictionary = _draw(p, "", int(KING_TIERS[r]))
		(k["ladder"] as Array).append(q["id"])
		_mark_seen(p, q["id"])
	if float(k["started_at"]) < 0.0:
		k["started_at"] = _now()
	return { "current": _king_q(k), "startedAt": k["started_at"], "serverNow": _now() }


static func king_answer(db: CaptainStore, uid: String, rung: float, chosen: float) -> Dictionary:
	if chosen < -1.0 or chosen > 3.0:
		return { "error": "Invalid answer" }
	var k: Dictionary = _king(db, uid)
	if k["status"] != "active":
		return { "error": "The run is over for this week" }
	if int(rung) != int(k["rung"]) or (k["ladder"] as Array).size() <= int(rung) or float(k["started_at"]) < 0.0:
		return { "error": "Out of step with the ladder" }
	if k["fifty"] is Dictionary and int(k["fifty"]["rung"]) == int(rung) and Js.includes(k["fifty"]["removed"], chosen):
		return { "error": "That option was struck by the 50/50" }
	var q: Dictionary = question(str(k["ladder"][int(rung)]))
	var timed: bool = chosen == -1.0 or timed_out(float(k["started_at"]), _now())
	var right: bool = not timed and int(chosen) == int(q["correct_index"])
	var prizes: Array = c()["kingPrizes"]
	var n: int = prizes.size()
	var status: String = "active"
	var new_rung: int = int(rung)
	var won: float = 0.0
	if right:
		new_rung += 1
		if new_rung == n:
			status = "crowned"
			won = float(prizes[n - 1])
	else:
		status = "busted"
		for h: Variant in c()["kingHavens"]:
			if int(rung) >= int(h):
				won = float(prizes[int(h) - 1])
	var pts: float = (float(c()["kingRungPoints"]) + (float(c()["kingCrownPoints"]) if status == "crowned" else 0.0)) if right else 0.0
	var out: Dictionary = _score(db, uid, right, pts)
	k["rung"] = float(new_rung)
	k["status"] = status
	k["started_at"] = -1.0
	if status != "active":
		k["awarded"] = won
	if won > 0.0:
		db.bump_stat(uid, "doubloons", won)
		db.ledger(uid, won, ("Pirate King: crowned, all %d questions" % n) if status == "crowned" else "Pirate King: fell to the haven at %d ⟡" % int(won))
	if status == "crowned":
		db.grant_badge(uid, "crowned")
	if new_rung >= 7:
		db.grant_badge(uid, "throne_in_sight")
	out.merge({ "correct": right, "timedOut": timed, "correctIndex": q["correct_index"], "explanation": q.get("explanation", ""), "status": status, "rung": float(new_rung), "doubloonsAwarded": won, "newDoubloons": Js.num(db.me(uid).get("doubloons")) })
	return out


static func king_fifty(db: CaptainStore, uid: String) -> Dictionary:
	var k: Dictionary = _king(db, uid)
	if k["status"] != "active":
		return { "error": "The run is over for this week" }
	if k["fifty"] != null:
		return { "error": "The 50/50 is already spent" }
	if (k["ladder"] as Array).size() <= int(k["rung"]):
		return { "error": "Reveal the question first" }
	var q: Dictionary = question(str(k["ladder"][int(k["rung"])]))
	var wrong: Array = [0.0, 1.0, 2.0, 3.0].filter(func(i: float) -> bool: return int(i) != int(q["correct_index"]))
	wrong.remove_at(int(floor(Dice.next() * wrong.size())))
	wrong.sort()
	k["fifty"] = { "rung": k["rung"], "removed": wrong }
	return { "removed": wrong }


static func king_walk(db: CaptainStore, uid: String) -> Dictionary:
	var k: Dictionary = _king(db, uid)
	if k["status"] != "active":
		return { "error": "No run to walk away from" }
	if int(k["rung"]) < 1:
		return { "error": "Answer at least one question first" }
	var won: float = float(c()["kingPrizes"][int(k["rung"]) - 1])
	k["status"] = "walked"
	k["awarded"] = won
	k["started_at"] = -1.0
	db.bump_stat(uid, "doubloons", won)
	db.ledger(uid, won, "Pirate King: walked at rung %d with %d ⟡" % [int(k["rung"]), int(won)])
	return { "status": "walked", "doubloonsAwarded": won, "newDoubloons": Js.num(db.me(uid).get("doubloons")) }


# ── Spin the Capstan ───────────────────────────────────────────────────────────

static func norm(s: String) -> String:
	var up: String = s.to_upper()
	var out: String = ""
	for ch: String in up:
		if (ch >= "A" and ch <= "Z") or ch == " ":
			out += ch
	while out.contains("  "):
		out = out.replace("  ", " ")
	return out.strip_edges()


static func _capstan(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = _p(db, uid)
	var wk: String = week_key(_now())
	var cs: Dictionary = Js.obj(p.get("capstan"))
	if cs.get("week") != wk:
		var seen: Array = Js.list(p.get("seen_phrases"))
		var all: Array = bank()["phrases"]
		var picks: Array = []
		var pool: Array = all.filter(func(x: Dictionary) -> bool: return not seen.has(x["id"]))
		while picks.size() < int(c()["capstanPerWeek"]):
			if pool.is_empty():
				seen.clear()
				pool = all.filter(func(x: Dictionary) -> bool: return not picks.any(func(y: Dictionary) -> bool: return y["id"] == x["id"]))
				if pool.is_empty():
					break
			var i: int = int(floor(Dice.next() * pool.size()))
			picks.append(pool[i])
			seen.append(pool[i]["id"])
			pool.remove_at(i)
		p["seen_phrases"] = seen
		cs = { "week": wk, "puzzles": picks, "runs": {}, "awarded": 0.0 }
		p["capstan"] = cs
	return cs


static func _run(cs: Dictionary, i: int) -> Dictionary:
	var runs: Dictionary = cs["runs"]
	if not runs.has(str(i)):
		runs[str(i)] = { "called": [], "bank": 0.0, "strikes": 0.0, "status": "active", "pending": null, "earned": 0.0, "hazards": 0.0 }
	return runs[str(i)]


static func _mask(phrase: String, called: Array) -> Array:
	var out: Array = []
	for word: String in norm(phrase).split(" "):
		var cells: Array = []
		for ch: String in word:
			cells.append(ch if called.has(ch) else null)
		out.append(cells)
	return out


static func _client(cs: Dictionary, i: int) -> Dictionary:
	var gen: Dictionary = cs["puzzles"][i]
	var r: Dictionary = _run(cs, i)
	return { "index": i, "category": gen["category"], "mask": _mask(gen["phrase"], r["called"]), "called": r["called"], "bank": r["bank"], "strikes": r["strikes"],
		"status": r["status"], "pendingValue": r["pending"], "phrase": norm(gen["phrase"]) if r["status"] != "active" else null, "earned": r["earned"] }


static func capstan(db: CaptainStore, uid: String) -> Dictionary:
	var cs: Dictionary = _capstan(db, uid)
	var list: Array = []
	for i: int in (cs["puzzles"] as Array).size():
		list.append(_client(cs, i))
	return { "week": cs["week"], "puzzles": list, "awarded": cs["awarded"], "wheel": c()["capstanWheel"] }


static func capstan_spin(db: CaptainStore, uid: String, i: float) -> Dictionary:
	var cs: Dictionary = _capstan(db, uid)
	if int(i) < 0 or int(i) >= (cs["puzzles"] as Array).size():
		return { "error": "No such puzzle." }
	var r: Dictionary = _run(cs, int(i))
	if r["status"] != "active":
		return { "error": "This puzzle is already finished." }
	if r["pending"] != null:
		return { "error": "Call a letter first." }
	var wheel: Array = c()["capstanWheel"]
	var spent: bool = float(r["hazards"]) >= float(c()["capstanMaxHazardRun"])
	var pool: Array = []
	for k: int in wheel.size():
		if not spent or typeof(wheel[k]) != TYPE_STRING:
			pool.append(k)
	var at: int = pool[int(floor(Dice.next() * pool.size()))]
	var wedge: Variant = wheel[at]
	var outcome: String = "value"
	if wedge is String and wedge == "overboard":
		outcome = "overboard"
		r["bank"] = 0.0
		r["hazards"] = float(r["hazards"]) + 1.0
	elif wedge is String:
		outcome = "lose_turn"
		r["strikes"] = float(r["strikes"]) + 1.0
		r["hazards"] = float(r["hazards"]) + 1.0
		if float(r["strikes"]) >= float(c()["capstanMaxStrikes"]):
			r["status"] = "failed"
	else:
		r["pending"] = float(wedge)
		r["hazards"] = 0.0
	return { "wedgeIndex": at, "wedge": wedge, "outcome": outcome, "puzzle": _client(cs, int(i)) }


static func capstan_letter(db: CaptainStore, uid: String, i: float, raw: String, vowel: bool) -> Dictionary:
	var cs: Dictionary = _capstan(db, uid)
	if int(i) < 0 or int(i) >= (cs["puzzles"] as Array).size():
		return { "error": "No such puzzle." }
	var r: Dictionary = _run(cs, int(i))
	if r["status"] != "active":
		return { "error": "This puzzle is already finished." }
	var letter: String = raw.to_upper()
	var is_v: bool = letter in ["A", "E", "I", "O", "U"]
	if letter.length() != 1 or letter < "A" or letter > "Z":
		return { "error": "Pick a vowel." if vowel else "Call a single consonant." }
	if vowel and not is_v:
		return { "error": "Pick a vowel." }
	if not vowel and is_v:
		return { "error": "Call a single consonant." }
	if vowel and r["pending"] != null:
		return { "error": "Call your consonant first." }
	if not vowel and r["pending"] == null:
		return { "error": "Spin the capstan first." }
	if (r["called"] as Array).has(letter):
		return { "error": "You have already tried that letter." }
	var cost: float = float(c()["capstanVowelCost"])
	if vowel and float(r["bank"]) < cost:
		return { "error": "A vowel costs %d in the bank." % int(cost) }
	var phrase: String = norm(str(cs["puzzles"][int(i)]["phrase"]))
	var count: int = phrase.count(letter)
	var gained: float = 0.0
	(r["called"] as Array).append(letter)
	if vowel:
		r["bank"] = float(r["bank"]) - cost
	else:
		var value: float = float(r["pending"])
		r["pending"] = null
		if count > 0:
			gained = value * count
			r["bank"] = float(r["bank"]) + gained
		else:
			r["strikes"] = float(r["strikes"]) + 1.0
			if float(r["strikes"]) >= float(c()["capstanMaxStrikes"]):
				r["status"] = "failed"
	return { "letter": letter, "count": float(count), "gained": gained, "puzzle": _client(cs, int(i)) }


static func capstan_solve(db: CaptainStore, uid: String, i: float, guess: String) -> Dictionary:
	var cs: Dictionary = _capstan(db, uid)
	if int(i) < 0 or int(i) >= (cs["puzzles"] as Array).size():
		return { "error": "No such puzzle." }
	var r: Dictionary = _run(cs, int(i))
	if r["status"] != "active":
		return { "error": "This puzzle is already finished." }
	var gen: Dictionary = cs["puzzles"][int(i)]
	var phrase: String = norm(str(gen["phrase"]))
	var right: bool = norm(guess) == phrase
	var out: Dictionary = { "correct": right, "earned": 0.0, "pointsEarned": 0.0 }
	if right:
		r["pending"] = null
		r["status"] = "solved"
		var letters: Array = []
		for ch: String in phrase.replace(" ", ""):
			if not letters.has(ch):
				letters.append(ch)
		r["called"] = letters
		r["earned"] = r["bank"]
		cs["awarded"] = float(cs["awarded"]) + float(r["earned"])
		var pts: float = float(c()["capstanSolvePoints"]) + (float(c()["capstanCleanBonus"]) if float(r["strikes"]) == 0.0 else 0.0)
		var pts0: float = Js.num(db.me(uid).get("parlor_points"))
		db.update_profile(uid, { "parlor_points": pts0 + pts })
		Skins.sync_parlor(db, uid)
		if float(r["earned"]) > 0.0:
			db.bump_stat(uid, "doubloons", float(r["earned"]))
			db.ledger(uid, float(r["earned"]), "Spin the Capstan: solved %s" % gen["category"])
		out["earned"] = r["earned"]
		out["pointsEarned"] = pts
		out["newPoints"] = pts0 + pts
		out["rankedUp"] = rank_of(pts0)["rank"]["title"] != rank_of(pts0 + pts)["rank"]["title"]
	else:
		r["strikes"] = float(r["strikes"]) + 1.0
		if float(r["strikes"]) >= float(c()["capstanMaxStrikes"]):
			r["status"] = "failed"
	out["puzzle"] = _client(cs, int(i))
	out["newDoubloons"] = Js.num(db.me(uid).get("doubloons"))
	return out


# ── Everything at once ─────────────────────────────────────────────────────────

static func state(db: CaptainStore, uid: String) -> Dictionary:
	Skins.sync_parlor(db, uid)
	var pts: float = Js.num(db.me(uid).get("parlor_points"))
	var rk: Dictionary = rank_of(pts)
	return {
		"board": board(db, uid), "king": king(db, uid), "capstan": capstan(db, uid),
		"points": pts, "rank": rk["rank"], "nextRank": rk["next"],
		"streak": Js.num(db.me(uid).get("parlor_streak")), "bestStreak": Js.num(db.me(uid).get("parlor_best_streak")),
		"seen": (_p(db, uid)["seen"] as Array).size(), "bankSize": (bank()["questions"] as Array).size(),
		"vouchers": Skins.vouchers(db.me(uid)),
	}
