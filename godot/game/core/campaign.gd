class_name Campaign
extends RefCounted
## THE CAMPAIGN MAP, RULES (a port of lib/raidMap computeRaidMap and
## chapterForNode, lib/raidCleared buildClearedSetVia, and lib/core/raidMap's
## getRaidMapView and markChapterUnlockSeen). The 64 nodes come from the rules
## (campaign.nodes, RAID_MAP in order); where each one sits on the water is
## campaignWater (raidWaters.ts).
##
## A node is CLEARED if it is the Reef Skirmish and the practice raid is done,
## if it is a raid whose raid is in the clears, or if it is in
## raid_node_progress.cleared. Otherwise LOCKED (Captain's water first, then
## the chain, the gate, Navigation, the Ancient Deep giants) or AVAILABLE.
## Parity: tests/parity/campaign.json.

const CAPTAIN_CHAPTERS: Array = ["the_last_fathom", "one_last_ride"]
const CAPTAIN_WATER: String = "Captain's water"

static var _by_id: Dictionary = {}


static func nodes() -> Array:
	return Rules.data()["campaign"]["nodes"]


static func chapters() -> Array:
	return Rules.data()["campaign"]["chapters"]


static func water() -> Dictionary:
	return Rules.data()["campaignWater"]


static func node(id: String) -> Dictionary:
	if _by_id.is_empty():
		for n: Dictionary in nodes():
			_by_id[n["id"]] = n
	return Js.obj(_by_id.get(id))


static func _index(id: String) -> int:
	var all: Array = nodes()
	for k: int in all.size():
		if all[k]["id"] == id:
			return k
	return -1


## chapterForNode: the first chapter whose last node is at or after this one.
static func chapter_for(id: String) -> Dictionary:
	var at: int = _index(id)
	for c: Dictionary in chapters():
		if at >= 0 and at <= _index(str(c["lastNodeId"])):
			return c
	return chapters()[chapters().size() - 1]


## buildClearedSetVia, as a list (in the order the web's Set fills).
static func cleared_set(db: CaptainStore, uid: String, prof: Dictionary) -> Array:
	var out: Array = []
	if Js.truthy(prof.get("has_completed_practice_raid")):
		out.append("skirmish")
	var done: Array = db.cleared_raid_ids(uid)
	for n: Dictionary in nodes():
		if n["type"] == "raid" and n.get("raidId") != null and done.has(n["raidId"]) and not out.has(n["id"]):
			out.append(n["id"])
	for id: Variant in Js.list(Js.obj(prof.get("raid_node_progress")).get("cleared")):
		if not out.has(id):
			out.append(id)
	return out


## computeRaidMap: every node's status, in map order.
static func compute(cleared: Array, doubloons: float, nav: int, admin: bool, ancients: int, captain: bool) -> Array:
	var holds: bool = false
	for id: Variant in cleared:
		if CAPTAIN_CHAPTERS.has(chapter_for(str(id))["id"]):
			holds = true
	var out: Array = []
	for n: Dictionary in nodes():
		if not admin and n.get("adminOnly") == true:
			continue
		if cleared.has(n["id"]):
			out.append({ "node": n, "status": "cleared", "claimable": false })
			continue
		if not admin and not captain and not holds and CAPTAIN_CHAPTERS.has(chapter_for(str(n["id"]))["id"]):
			out.append({ "node": n, "status": "locked", "claimable": false, "lockReason": CAPTAIN_WATER })
			continue
		if n.get("comingSoon") == true and not admin:
			out.append({ "node": n, "status": "locked", "claimable": false, "lockReason": "Coming soon" })
			continue
		var prereq: bool = n.get("requiresNode") == null or cleared.has(n["requiresNode"])
		var gate: bool = n.get("requiresClearedNode") == null or cleared.has(n["requiresClearedNode"])
		var nav_ok: bool = n.get("requiresNavLevel") == null or float(nav) >= float(n["requiresNavLevel"])
		var anc_ok: bool = n.get("requiresAncients") == null or float(ancients) >= float(n["requiresAncients"])
		if not prereq or not gate or not nav_ok or not anc_ok:
			var req: Dictionary = node(str(n.get("requiresClearedNode") if prereq else n.get("requiresNode")))
			var verb: String = "Read" if req.get("type") == "story" else "Clear"
			var gate_line: String = str(n["gateLockNote"]) if prereq and not gate and n.get("gateLockNote") != null else "%s %s first" % [verb, req.get("label", "the previous stop")]
			var why: String
			if not prereq or not gate:
				why = gate_line
			elif not nav_ok:
				why = "Reach Navigation Level %d" % int(n["requiresNavLevel"])
			else:
				why = "Land all %d Ancient Deep giants (%d/%d)" % [int(n["requiresAncients"]), ancients, int(n["requiresAncients"])]
			out.append({ "node": n, "status": "locked", "claimable": false, "lockReason": why })
			continue
		var claimable: bool = n["type"] == "milestone" and n.get("milestone") is Dictionary and doubloons >= float(n["milestone"]["amount"])
		out.append({ "node": n, "status": "available", "claimable": claimable })
	return out


## getRaidMapView.
static func view(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "finn_spoil_free, finn_spoil_paid, doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, ship_classes, seen_chapter_unlocks, seen_ultimate_unlock, is_admin, ancient_catches, is_premium, premium_expires_at")
	var doubloons: float = Js.num(p.get("doubloons"))
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var admin: bool = p.get("is_admin") == true
	var cleared: Array = cleared_set(db, uid, p)
	return {
		"views": compute(cleared, doubloons, nav, admin, Js.list(p.get("ancient_catches")).size(), Rules.in_captains_water(p)),
		"doubloons": doubloons,
		"spoilFree": p.get("finn_spoil_free"),
		"spoilPaid": p.get("finn_spoil_paid"),
		"navLevel": float(nav),
		"raidRecords": records(db, uid),
		"shipClasses": Js.obj(p.get("ship_classes")),
		"seenChapterUnlocks": Js.list(p.get("seen_chapter_unlocks")),
		"seenUltimateUnlock": p.get("seen_ultimate_unlock") == true,
		"raidNodeChoices": Js.obj(Js.obj(p.get("raid_node_progress")).get("choices")),
		"musterParty": muster_party(db, uid),
	}


## aggregateShipClasses: the class picks' effects, multiplied and summed.
static func class_effects(picks: Variant) -> Dictionary:
	var out: Dictionary = { "damageMult": 1.0, "hpMult": 1.0, "speedFlat": 0.0, "doubloonMult": 1.0, "itemSlots": 0.0, "crewSlots": 0.0, "count": 0.0 }
	var defs: Dictionary = Rules.data()["shipClasses"]["classes"]
	for id: Variant in Js.obj(picks).values():
		var cls: Dictionary = Js.obj(defs.get(id))
		if cls.is_empty():
			continue
		var e: Dictionary = cls["effects"]
		for k: String in ["damageMult", "hpMult", "doubloonMult"]:
			out[k] = float(out[k]) * float(e.get(k, 1.0))
		for k: String in ["speedFlat", "itemSlots", "crewSlots"]:
			out[k] = float(out[k]) + float(e.get(k, 0.0))
		out["count"] = float(out["count"]) + 1.0
	return out


## loadMusterParty: who the don's clerk counts (the raid seats the ship can
## hold, none out on a trawl), as { name, level, classId }.
static func muster_party(db: CaptainStore, uid: String) -> Array:
	var p: Dictionary = db.profile(uid, "ship_tier, ship_classes, has_sixth_berth")
	var ship: Dictionary = Js.obj(Js.obj(Rules.data().get("shipCombat")).get(str(int(Js.nz(p.get("ship_tier"), 0.0)))))
	if ship.is_empty():
		return []
	var slots: float = float(ship["crewSlots"]) + float(class_effects(p.get("ship_classes"))["crewSlots"]) + (1.0 if p.get("has_sixth_berth") == true else 0.0)
	var trawling: Array = Js.list(db.save.get("trawls")).map(func(t: Dictionary) -> Variant: return t["crew_id"])
	var seated: Array = Crew.live(db).filter(func(c: Dictionary) -> bool: return c.get("raid_slot") != null and float(c["raid_slot"]) < slots and not trawling.has(c["id"]))
	seated.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["raid_slot"]) < float(b["raid_slot"]))
	var by_slug: Dictionary = Js.obj(Crew.t().get("classBySlug"))
	return seated.map(func(c: Dictionary) -> Dictionary:
		var card: Dictionary = Crew.card(float(c["card_id"]))
		var slug: String = str(card.get("slug", "")).to_lower()
		return {
			"name": c["nickname"] if c.get("nickname") != null else Crew.display_name(slug, str(card.get("name", "Crew"))),
			"level": float(Crew.level(Js.num(c.get("xp")))),
			"classId": by_slug.get(slug),
		})


## loadRaidRecords over the local store (raidLocal raidRecords): a ledger of one.
static func records(db: CaptainStore, uid: String) -> Dictionary:
	var admin: bool = db.me(uid).get("is_admin") == true
	var out: Dictionary = {}
	for c: Dictionary in Js.list(db.save.get("raidClears")):
		var id: String = str(c["raid_id"])
		if out.has(id):
			continue
		var best: Variant = null
		for d: Dictionary in Js.list(db.save.get("raidClears")):
			if d["raid_id"] == id and d.get("ms") != null and (best == null or float(d["ms"]) < float(best)):
				best = float(d["ms"])
		out[id] = {
			"fastestUsername": "—" if admin or best == null else (str(db.me(uid)["username"]) if db.me(uid).get("username") != null else ""),
			"fastestMs": 0.0 if admin or best == null else best,
			"yourBestMs": best,
			"totalClearers": 0.0 if admin else 1.0,
		}
	return out


## The view with each node as its id, status, claimability and lock reason
## (what the parity rig compares; the node itself is rules).
static func slim(v: Dictionary) -> Dictionary:
	var out: Dictionary = v.duplicate()
	out["views"] = (v["views"] as Array).map(func(x: Dictionary) -> Dictionary:
		var o: Dictionary = { "id": x["node"]["id"], "status": x["status"], "claimable": x["claimable"] }
		if x.has("lockReason"):
			o["lockReason"] = x["lockReason"]
		return o)
	return out


## { node_id: status } from a view, for the water's quick lookups.
static func statuses(v: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for x: Dictionary in v["views"]:
		out[x["node"]["id"]] = x["status"]
	return out


## markChapterUnlockSeen: the chapter's celebration, once.
static func mark_chapter_seen(db: CaptainStore, uid: String, chapter_id: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "seen_chapter_unlocks")
	var seen: Array = Js.list(p.get("seen_chapter_unlocks"))
	if seen.has(chapter_id):
		return { "ok": true }
	var nx: Array = seen.duplicate()
	nx.append(chapter_id)
	db.update_profile(uid, { "seen_chapter_unlocks": nx })
	return { "ok": true }


# ══ The nodes' actions (lib/core/raidMap.ts) ═══════════════════════════════════
#
# A node clears once, and only the clear that lands pays (commitNodeClear):
# raid_node_progress is written only while it still equals what was read. Coin
# spent goes first, as the guard, and comes back if the clear loses.

static func _commit(db: CaptainStore, uid: String, read: Variant, patch: Dictionary) -> bool:
	var g: Dictionary = { "col": "raid_node_progress", "is": null } if read == null else { "col": "raid_node_progress", "eq": JsJson.stringify(read) }
	return db.update_profile_if(uid, patch, [g])


static func _prog(p: Dictionary) -> Dictionary:
	return Js.obj(p.get("raid_node_progress")).duplicate(true)


## { ...prog, cleared: [...cleared, id] } (and a choice, if given).
static func _with_clear(prog: Dictionary, id: String, choice: Variant = null) -> Dictionary:
	var out: Dictionary = prog.duplicate(true)
	var cl: Array = Js.list(prog.get("cleared")).duplicate()
	if not cl.has(id):
		cl.append(id)
	out["cleared"] = cl
	if choice != null:
		var ch: Dictionary = Js.obj(prog.get("choices")).duplicate()
		ch[id] = choice
		out["choices"] = ch
	return out


static func _nav(p: Dictionary) -> int:
	return Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))


## The common gate: the chain and Navigation. "" when through.
static func _gate(n: Dictionary, p: Dictionary, cleared: Array) -> String:
	if n.get("requiresNode") != null and not cleared.has(n["requiresNode"]):
		return "Locked"
	if n.get("requiresNavLevel") != null and float(_nav(p)) < float(n["requiresNavLevel"]):
		return "Locked"
	return ""


## mapNodeRefusal.
static func _refusal(n: Dictionary, p: Dictionary, cleared: Array, already: String) -> String:
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return "Locked"
	if cleared.has(n["id"]):
		return already
	return _gate(n, p, cleared)


static func _nav_xp(db: CaptainStore, uid: String, n: float) -> void:
	if n > 0.0:
		db.bump_stat(uid, "expedition_xp", n)


## eyeCharge: The Primeval Eye's charge after `nav` Navigation XP, or null.
static func _eye(p: Dictionary, nav: float) -> Variant:
	var on: bool = p.get("equipped_special_2") == "anglers_patience" and p.get("has_anglers_patience") == true and (p.get("finn_spoil_free") == "fishing" or p.get("finn_spoil_paid") == "fishing")
	return Js.num(p.get("anglers_patience_xp")) + nav if on else null


## applyLegendaryGate: a gate node's legendary into the recruit pool.
static func _legendary(nid: String, prior: Array, patch: Dictionary) -> Variant:
	var slug: Variant = null
	var gates: Dictionary = Js.obj(Crew.t().get("legendaryGate"))
	for s: Variant in gates:
		if gates[s] == nid:
			slug = s
	if slug == null:
		return null
	for u: Variant in prior:
		if str(u).to_lower() == slug:
			return null
	var nx: Array = prior.duplicate()
	nx.append(slug)
	patch["legendary_unlocks"] = nx
	var key: String = "_".join(PackedStringArray(Array(str(slug).split("_")).map(func(w: String) -> String: return w.substr(0, 1).to_upper() + w.substr(1))))
	var card: Dictionary = {}
	for c: Dictionary in Crew.cards():
		if c.get("slug") == key:
			card = c
	return { "slug": slug, "name": card.get("name", slug), "filename": card.get("filename", "") }


## claimMilestoneNode: a toll (or a reward) once.
static func claim_milestone(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "milestone" or not (n.get("milestone") is Dictionary):
		return { "error": "Invalid node" }
	var p: Dictionary = db.profile(uid, "doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "error": "Already claimed" }
	var g: String = _gate(n, p, cleared)
	if g != "":
		return { "error": g }
	var m: Dictionary = n["milestone"]
	if Js.num(p.get("doubloons")) < float(m["amount"]):
		return { "error": "Not enough doubloons" }
	var cost: float = float(m["amount"]) if m.get("spend") == true else 0.0
	if cost > 0.0 and db.spend(uid, "doubloons", cost) == null:
		return { "error": "Not enough doubloons" }
	if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid) }):
		if cost > 0.0:
			db.grant(uid, "doubloons", cost)
		return { "error": "Already claimed" }
	return { "doubloons": db.grant(uid, "doubloons", 0.0 if m.get("spend") == true else Js.num(m.get("rewardDoubloons"))) }


## markStoryNodeRead: a story (or a berth's terms) read is its clear.
static func mark_story_read(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or (n["type"] != "story" and n["type"] != "berth"):
		return { "error": "Invalid node" }
	var p: Dictionary = db.profile(uid, "has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "ok": true }
	if n.get("requiresNode") != null and not cleared.has(n["requiresNode"]):
		return { "error": "Locked" }
	var patch: Dictionary = { "raid_node_progress": _with_clear(_prog(p), nid) }
	var leg: Variant = _legendary(nid, Js.list(p.get("legendary_unlocks")), patch)
	db.update_profile(uid, patch)
	return { "ok": true, "unlockedLegendary": leg } if leg != null else { "ok": true }


## solvePuzzleNode: the board is solved here (the client is trusted); its XP.
static func solve_puzzle(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "puzzle" or not (n.get("puzzle") is Dictionary):
		return { "error": "Invalid node" }
	var p: Dictionary = db.profile(uid, "expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var xp: float = Js.num(p.get("expedition_xp"))
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "expeditionXp": xp }
	var g: String = _gate(n, p, cleared)
	if g != "":
		return { "error": g }
	var gain: float = Js.num(n["puzzle"].get("rewardNavXp"))
	var patch: Dictionary = {}
	var eye: Variant = _eye(p, gain)
	if eye != null:
		patch["anglers_patience_xp"] = eye
	patch["raid_node_progress"] = _with_clear(_prog(p), nid)
	if not _commit(db, uid, p.get("raid_node_progress"), patch):
		return { "expeditionXp": xp }
	_nav_xp(db, uid, gain)
	return { "expeditionXp": xp + gain }


## claimQuartermasterChoice: one of two raid items, for good.
static func claim_choice(db: CaptainStore, uid: String, nid: String, item: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or not (n.get("choice") is Dictionary):
		return { "error": "Invalid node" }
	if not Js.list(n["choice"].get("items")).has(item):
		return { "error": "Invalid choice" }
	var p: Dictionary = db.profile(uid, "has_completed_practice_raid, raid_node_progress, raid_items, expedition_xp, is_admin")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "error": "Already chosen" }
	var g: String = _gate(n, p, cleared)
	if g != "":
		return { "error": g }
	if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid) }):
		return { "error": "Already chosen" }
	var held: Array = Js.list(db.me(uid).get("raid_items")).duplicate()
	held.append(item)
	db.update_profile(uid, { "raid_items": held })
	return { "ok": true }


## musterReport: the clerk's checklist over the raid party.
static func muster_report(m: Dictionary, party: Array) -> Dictionary:
	var answers: Dictionary = { "anchor": ["brace"], "abyssal_tide": ["shield", "heal"], "mender": ["heal"], "snare": ["snare"], "leviathan": ["burst"], "blitz": ["burst"], "foresight": ["brace", "shield", "heal", "snare", "burst"] }
	var label: Dictionary = { "brace": "Brace", "shield": "Shield", "snare": "Snare", "heal": "Heal", "burst": "Heavy Salvo" }
	var rows: Array = []
	rows.append({ "label": "%d crew at the rail" % int(m["minCrew"]), "met": party.map(func(c: Dictionary) -> Variant: return c["name"]), "ok": party.size() >= int(m["minCrew"]) })
	var under: Array = party.filter(func(c: Dictionary) -> bool: return float(c["level"]) < float(m["minLevel"]))
	rows.append({ "label": "Every hand at Level %d or better" % int(m["minLevel"]), "met": under.map(func(c: Dictionary) -> String: return "%s is only %d" % [c["name"], int(c["level"])]), "ok": party.size() > 0 and under.is_empty() })
	for group: Array in m["requires"]:
		var who: Array = party.filter(func(c: Dictionary) -> bool:
			var can: Array = answers.get(c["classId"], []) if c.get("classId") != null else []
			return group.any(func(r: Variant) -> bool: return can.has(r)))
		rows.append({ "label": "Someone who can %s" % " or ".join(PackedStringArray(group.map(func(r: Variant) -> String: return label[r]))), "met": who.map(func(c: Dictionary) -> Variant: return c["name"]), "ok": not who.is_empty() })
	return { "rows": rows, "passed": rows.all(func(r: Dictionary) -> bool: return r["ok"]) }


## standForMuster.
static func stand_muster(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "muster" or not (n.get("muster") is Dictionary):
		return { "error": "Invalid node" }
	var p: Dictionary = db.profile(uid, "has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "ok": true }
	var g: String = _gate(n, p, cleared)
	if g != "":
		return { "error": g }
	var rep: Dictionary = muster_report(n["muster"], muster_party(db, uid))
	if not rep["passed"]:
		var missing: Array = (rep["rows"] as Array).filter(func(r: Dictionary) -> bool: return not r["ok"]).map(func(r: Dictionary) -> Variant: return r["label"])
		return { "error": "The clerk shakes his head: %s." % "; ".join(PackedStringArray(missing)) }
	db.update_profile(uid, { "raid_node_progress": _with_clear(_prog(p), nid) })
	return { "ok": true }


## pickRaidEventChoice: one call, its outcome, the others gone.
static func pick_event(db: CaptainStore, uid: String, nid: String, choice_id: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "event" or not (n.get("event") is Dictionary):
		return { "error": "Invalid node" }
	if n.get("comingSoon") == true:
		return { "error": "Coming soon" }
	var choice: Dictionary = {}
	for c: Dictionary in n["event"]["choices"]:
		if c["id"] == choice_id:
			choice = c
	if choice.is_empty():
		return { "error": "Invalid choice" }
	var p: Dictionary = db.profile(uid, "doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "error": "Already chosen" }
	var g: String = _gate(n, p, cleared)
	if g != "":
		return { "error": g }
	var out: Dictionary = { "ok": true }
	var oc: Dictionary = choice["outcome"]
	var coin: float = Js.num(oc.get("amount")) if oc["type"] == "doubloons" else 0.0
	if coin < 0.0:
		var left: Variant = db.spend(uid, "doubloons", -coin)
		if left == null:
			return { "error": "Not enough doubloons" }
		out["newDoubloons"] = left
	if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid, choice_id) }):
		if coin < 0.0:
			db.grant(uid, "doubloons", -coin)
		return { "error": "Already chosen" }
	if coin > 0.0:
		out["newDoubloons"] = db.grant(uid, "doubloons", coin)
	if oc["type"] == "navXp":
		out["newExpeditionXp"] = Js.num(p.get("expedition_xp")) + float(oc["amount"])
		_nav_xp(db, uid, float(oc["amount"]))
	if oc["type"] == "doubloons":
		db.ledger(uid, float(oc["amount"]), "Raid event: %s (%s)" % [n["label"], choice["label"]])
	return out


## rollDiceNode: one throw, a d20 plus a little Navigation against the DC.
static func roll_dice(db: CaptainStore, uid: String, nid: String, option_id: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "dice" or not (n.get("dice") is Dictionary):
		return { "error": "Invalid node" }
	if n.get("comingSoon") == true:
		return { "error": "Coming soon" }
	var opt: Dictionary = {}
	for o: Dictionary in n["dice"]["options"]:
		if o["id"] == option_id:
			opt = o
	if opt.is_empty():
		return { "error": "Invalid option" }
	var p: Dictionary = db.profile(uid, "doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin")
	var cleared: Array = cleared_set(db, uid, p)
	var nav: int = _nav(p)
	var g: String = _refusal(n, p, cleared, "Already thrown")
	if g != "":
		return { "error": g }
	var purse: float = Js.num(p.get("doubloons"))
	if Js.num(opt.get("requiresDoubloons")) > 0.0 and purse < float(opt["requiresDoubloons"]):
		return { "error": "Need %s doubloons to risk it" % Js.thousands(float(opt["requiresDoubloons"])) }
	var d: Dictionary = n["dice"]
	var bonus: float = minf(float(d["maxBonus"]), floor(float(nav) / float(d["bonusPerLevels"])))
	var roll: float = 1.0 + floor(Dice.next() * 20.0)
	var total: float = roll + bonus
	var success: bool = total >= float(opt["dc"])
	var oc: Dictionary = opt["win"] if success else opt["miss"]
	var delta: float = maxf(0.0, purse + Js.num(oc.get("doubloons"))) - purse
	var nav_d: float = Js.num(oc.get("navXp"))
	var new_d: float = purse + delta
	if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid, option_id) }):
		return { "error": "Already thrown" }
	if delta > 0.0:
		new_d = db.grant(uid, "doubloons", delta)
	elif delta < 0.0:
		var left: Variant = db.spend(uid, "doubloons", -delta)
		if left != null:
			new_d = left
		else:
			var have: float = Js.num(db.me(uid).get("doubloons"))
			var taken: Variant = db.spend(uid, "doubloons", have)
			new_d = taken if taken != null else 0.0
			delta = -have
	_nav_xp(db, uid, nav_d)
	if delta != 0.0:
		db.ledger(uid, delta, "Raid: %s (%s, %s)" % [n["label"], opt["label"], "won" if success else "lost"])
	return { "roll": roll, "bonus": bonus, "total": total, "dc": opt["dc"], "success": success, "doubloonsDelta": delta, "navXpDelta": nav_d, "newDoubloons": new_d, "newExpeditionXp": Js.num(p.get("expedition_xp")) + nav_d }


## claimScoutDebt: a story whose pay rides a choice made earlier.
static func claim_scout_debt(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "story" or not (n.get("payoff") is Dictionary):
		return { "error": "Invalid node" }
	if n.get("comingSoon") == true:
		return { "error": "Coming soon" }
	var p: Dictionary = db.profile(uid, "doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var prog: Dictionary = _prog(p)
	var purse: float = Js.num(p.get("doubloons"))
	var xp: float = Js.num(p.get("expedition_xp"))
	var rc: Dictionary = n["payoff"]["requiresChoice"]
	var met: bool = Js.obj(prog.get("choices")).get(rc["nodeId"]) == rc["choiceId"]
	var nothing: Dictionary = { "met": met, "doubloonsDelta": 0.0, "navXpDelta": 0.0, "newDoubloons": purse, "newExpeditionXp": xp }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return nothing
	if n.get("requiresNode") != null and not cleared.has(n["requiresNode"]):
		return { "error": "Locked" }
	var grant: Dictionary = Js.obj(n["payoff"].get("grant")) if met else {}
	var dd: float = Js.num(grant.get("doubloons"))
	var nd: float = Js.num(grant.get("navXp"))
	var patch: Dictionary = { "raid_node_progress": _with_clear(prog, nid) }
	var leg: Variant = _legendary(nid, Js.list(p.get("legendary_unlocks")), patch)
	if not _commit(db, uid, p.get("raid_node_progress"), patch):
		return nothing
	var new_d: float = purse + dd
	if dd > 0.0:
		new_d = db.grant(uid, "doubloons", dd)
	_nav_xp(db, uid, nd)
	if dd != 0.0:
		db.ledger(uid, dd, "Raid: %s" % n["label"])
	var out: Dictionary = { "met": met, "doubloonsDelta": dd, "navXpDelta": nd, "newDoubloons": new_d, "newExpeditionXp": xp + nd }
	if leg != null:
		out["unlockedLegendary"] = leg
	return out


## offeredShipClassIds: per line, the first mark not yet owned.
static func offered_classes(picks: Dictionary) -> Array:
	var owned: Array = picks.values()
	var out: Array = []
	for line: Array in Rules.data()["shipClasses"]["lines"]:
		for id: Variant in line:
			if not owned.has(id):
				out.append(id)
				break
	return out


## pickShipClass: the chapter's class, for good.
static func pick_class(db: CaptainStore, uid: String, nid: String, class_id: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "class_pick" or not (n.get("classPick") is Dictionary):
		return { "error": "Invalid node" }
	if not (Rules.data()["shipClasses"]["classes"] as Dictionary).has(class_id):
		return { "error": "Invalid class" }
	var p: Dictionary = db.profile(uid, "has_completed_practice_raid, raid_node_progress, ship_classes, is_admin")
	if n.get("adminOnly") == true and p.get("is_admin") != true:
		return { "error": "Locked" }
	var cleared: Array = cleared_set(db, uid, p)
	if cleared.has(nid):
		return { "error": "Already chosen" }
	if n.get("requiresNode") != null and not cleared.has(n["requiresNode"]):
		return { "error": "Locked" }
	var picks: Dictionary = Js.obj(p.get("ship_classes")).duplicate()
	var ch: String = str(n["classPick"]["chapterId"])
	if Js.truthy(picks.get(ch)):
		return { "error": "Class already picked for this chapter" }
	if n["classPick"].get("options") != null:
		if not Js.list(n["classPick"]["options"]).has(class_id):
			return { "error": "That choice is not on this menu" }
	elif not offered_classes(picks).has(class_id):
		return { "error": "That class is not available to you" }
	picks[ch] = class_id
	db.update_profile(uid, { "ship_classes": picks, "raid_node_progress": _with_clear(_prog(p), nid) })
	if nid == "chapter_2_class" and Rules.web_only:
		db.mail_to(uid, "The Locker Opens: Davy Jones Gauntlet Unlocked", "You closed out Chapter 2. Word travels fast down in the dark, and something has taken notice.\n\nThe Davy Jones Gauntlet is open to you now. Descend as deep as you dare, fighting ship after ship while one pot swells with every kill. Cash out and it's all yours. Sink before you do and it goes to the deep with you.\n\nGo as deep as you can and you'll tear loose rewards that follow you topside. Find it under Expeditions.\n\n— Davy Jones", "Davy Jones")
	return { "ok": true }


## The spoils of the Sunken Hand: one side free, the other for SPOILS_PRICE.
const SPOILS_PRICE: float = 2500000.0


static func _spoils_cleared(db: CaptainStore, uid: String) -> void:
	var p: Dictionary = db.profile(uid, "raid_node_progress")
	var prog: Dictionary = _prog(p)
	if Js.list(prog.get("cleared")).has("spoils_of_the_hand"):
		return
	db.update_profile(uid, { "raid_node_progress": _with_clear(prog, "spoils_of_the_hand") })


static func choose_spoil(db: CaptainStore, uid: String, side: Variant) -> Dictionary:
	if side != "fishing" and side != "nav":
		return { "ok": false, "error": "Unknown spoil." }
	var p: Dictionary = db.profile(uid, "doubloons, finn_spoil_free, finn_spoil_paid")
	if not db.has_cleared(uid, "the_sunken_hand"):
		return { "ok": false, "error": "Put him down first." }
	if Js.truthy(p.get("finn_spoil_free")):
		return { "ok": false, "error": "You already took one off his wreck." }
	if not db.update_profile_if(uid, { "finn_spoil_free": side }, [{ "col": "finn_spoil_free", "is": null }]):
		return { "ok": false, "error": "You already took one off his wreck." }
	_spoils_cleared(db, uid)
	return { "ok": true }


static func buy_spoil(db: CaptainStore, uid: String, side: Variant) -> Dictionary:
	if side != "fishing" and side != "nav":
		return { "ok": false, "error": "Unknown spoil." }
	var p: Dictionary = db.profile(uid, "doubloons, finn_spoil_free, finn_spoil_paid")
	if not db.has_cleared(uid, "the_sunken_hand"):
		return { "ok": false, "error": "Put him down first." }
	if not Js.truthy(p.get("finn_spoil_free")):
		return { "ok": false, "error": "Take your free pick first." }
	if p["finn_spoil_free"] == side:
		return { "ok": false, "error": "You already carry that one." }
	if Js.truthy(p.get("finn_spoil_paid")):
		return { "ok": false, "error": "You already bought the other." }
	var left: Variant = db.spend(uid, "doubloons", SPOILS_PRICE)
	if left == null:
		return { "ok": false, "error": "You need %s doubloons." % Js.thousands(SPOILS_PRICE) }
	if not db.update_profile_if(uid, { "finn_spoil_paid": side }, [{ "col": "finn_spoil_paid", "is": null }]):
		db.grant(uid, "doubloons", SPOILS_PRICE)
		return { "ok": false, "error": "You already bought the other." }
	_spoils_cleared(db, uid)
	return { "ok": true, "doubloons": left }


# ── The DPS gate (port-native: the shot reads the battle's seat) ─────────────

## dpsPreview over the battle's seat: the straight-hit range, the class
## multiplier, and the share of the range that clears the threshold.
static func dps_preview(db: CaptainStore, uid: String, nid: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "dps_check":
		return { "error": "Invalid node" }
	var s: Dictionary = Battle.seat_for(db, uid)
	var smin: float = float(s["shipMin"])
	var pmax: float = maxf(smin, float(Js.round(smin + 2.0 + floor(float(s["power"]) / 4.0))))
	var lo: float = maxf(smin, floor(pmax * 0.4))
	var mult: float = float(class_effects(db.me(uid).get("ship_classes"))["damageMult"])
	var th: float = float(n["dpsCheck"]["threshold"])
	var passing: int = 0
	for r: int in range(int(lo), int(pmax) + 1):
		if float(Js.round(r * mult)) >= th:
			passing += 1
	var tot: float = pmax - lo + 1.0
	return { "rangeMin": lo, "rangeMax": pmax, "mult": mult, "threshold": th, "passChance": clampf(roundf(passing / tot * 100.0), 0.0, 100.0) if tot > 0.0 else 0.0, "power": s["power"], "shipMinDamage": smin }


## resolveDpsCheck: pay past it, or fire one straight shot at it. A miss
## clears nothing and charges nothing.
static func resolve_dps(db: CaptainStore, uid: String, nid: String, action: String) -> Dictionary:
	var n: Dictionary = node(nid)
	if n.is_empty() or n["type"] != "dps_check" or not (n.get("dpsCheck") is Dictionary):
		return { "error": "Invalid node" }
	var p: Dictionary = db.profile(uid, "doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin")
	var cleared: Array = cleared_set(db, uid, p)
	var g: String = _refusal(n, p, cleared, "Already cleared")
	if g != "":
		return { "error": g }
	var dc: Dictionary = n["dpsCheck"]
	var purse: float = Js.num(p.get("doubloons"))
	if action == "pay":
		var cost: float = float(dc["payCost"])
		if purse < cost or db.spend(uid, "doubloons", cost) == null:
			return { "error": "Need %s doubloons" % Js.thousands(cost) }
		if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid, "paid") }):
			db.grant(uid, "doubloons", cost)
			return { "error": "Need %s doubloons" % Js.thousands(cost) }
		db.ledger(uid, -cost, "Raid: %s (paid)" % n["label"])
		return { "outcome": "paid", "newDoubloons": purse - cost }
	var pv: Dictionary = dps_preview(db, uid, nid)
	var base: float = floor(Dice.next() * (float(pv["rangeMax"]) - float(pv["rangeMin"]) + 1.0)) + float(pv["rangeMin"])
	var dmg: float = float(Js.round(base * float(pv["mult"])))
	var br: Dictionary = { "roll": base, "rangeMin": pv["rangeMin"], "rangeMax": pv["rangeMax"], "mult": pv["mult"] }
	if dmg >= float(dc["threshold"]):
		if not _commit(db, uid, p.get("raid_node_progress"), { "raid_node_progress": _with_clear(_prog(p), nid, "passed") }):
			return { "error": "Already cleared" }
		return { "outcome": "passed", "damage": dmg, "threshold": dc["threshold"], "newDoubloons": purse, "breakdown": br }
	return { "outcome": "failed", "damage": dmg, "threshold": dc["threshold"], "doubloonsDelta": 0.0, "newDoubloons": purse, "breakdown": br }
