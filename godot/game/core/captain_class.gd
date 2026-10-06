class_name CaptainClass
extends RefCounted
## CAPTAIN'S CHOICE, REWORKED (Godot port, Kong 2026-10-06: "really hone in on
## classes and special abilities vs ... boring damage and health
## multipliers"; his numbers, settled that day). Chapter I's choice is a
## CLASS: a passive, and an ORDER that works like a crew order (used once,
## back when the crew's orders come back, at the raid's rest) but TAKES YOUR
## TURN, chosen from the Special menu beside the repair kit. Chapters II and
## III each offer two upgrades of that class: one raises the passive, one
## shapes the order. Values REPLACE, never stack: a passive of 10% raised to
## 15% is 15%.
##
##   MASTER GUNNER  order Powder Keg: your next attack hits every enemy afloat.
##                  passive: critical hits deal 10% more.
##                  II: crits 15% more, or a hit has a 10% chance to come up a crit.
##                  III: Powder Keg takes no turn, or crits 20% more.
##   IRONSIDE       order Draw Fire: for 2 rounds the enemy's aimed shots come
##                  at you, and you take 25% less.
##                  passive: +15% hull.
##                  II: +25% hull, or take 10% less from every hit.
##                  III: +50% hull, or Draw Fire takes 50% less.
##   SURGEON        order Field Surgery: heal a crewmate (or yourself) for 30%
##                  of their hull.
##                  passive: your heals and shields are 10% stronger.
##                  II: 20% stronger, or Field Surgery also shields 10% of hull.
##                  III: Field Surgery heals every ship at once, or heals 50%.
##   HELMSMAN       order Full Sail: each ship in the line (yours too) has a 50%
##                  chance to load a ball.
##                  passive: +15% doubloons from raids.
##                  II: a 75% chance, or +25% doubloons.
##                  III: a 100% chance, or +50% doubloons.
##
## Picks live where they always did (profile ship_classes: chapter -> id):
## thread -> the class; sunken_hand -> <class>_ii_a / _ii_b; the_coffers ->
## <class>_iii_a / _iii_b (a: the first option above, b: the second). Old
## picks (the web's lines) are read as the line's class with its passive
## raised at each further pick. The parity run keeps the web's classes.

const CLASSES: Array = ["master_gunner", "ironside", "surgeon", "helmsman"]
const ORDER: Dictionary = { "master_gunner": "powder_keg", "ironside": "draw_fire", "surgeon": "field_surgery", "helmsman": "full_sail" }
const ORDER_NAME: Dictionary = { "powder_keg": "Powder Keg", "draw_fire": "Draw Fire", "field_surgery": "Field Surgery", "full_sail": "Full Sail" }
## Which branch raises the passive, per chapter (for old picks).
const PASSIVE_II: Dictionary = { "master_gunner": "_ii_a", "ironside": "_ii_a", "surgeon": "_ii_a", "helmsman": "_ii_b" }
const PASSIVE_III: Dictionary = { "master_gunner": "_iii_b", "ironside": "_iii_a", "surgeon": "_iii_b", "helmsman": "_iii_b" }
const OLD_LINE: Dictionary = { "master_gunner": "master_gunner", "ironside": "ironside", "helmsman": "helmsman", "buccaneer": "surgeon" }


static func on() -> bool:
	return not Rules.web_only


## The picks in the new shape (an old save's lines read as a class).
static func normalize(picks: Variant) -> Dictionary:
	var p: Dictionary = Js.obj(picks)
	var first: String = str(p.get("thread", ""))
	if first == "" or CLASSES.has(first) and not _old_style(p):
		return p
	var base: String = ""
	for k: String in OLD_LINE:
		if first.begins_with(k):
			base = OLD_LINE[k]
	if base == "":
		return p
	var out: Dictionary = { "thread": base }
	if p.has("sunken_hand"):
		out["sunken_hand"] = base + str(PASSIVE_II[base])
	if p.has("the_coffers"):
		out["the_coffers"] = base + str(PASSIVE_III[base])
	return out


static func _old_style(p: Dictionary) -> bool:
	for v: Variant in p.values():
		var s: String = str(v)
		if s.ends_with("_ii") or s.ends_with("_iii") or s.begins_with("buccaneer"):
			return true
	return false


## Everything the class does, as numbers (values replace, never stack).
static func effects(picks: Variant) -> Dictionary:
	var p: Dictionary = normalize(picks)
	var cls: String = str(p.get("thread", ""))
	var ii: String = str(p.get("sunken_hand", "")).trim_prefix(cls)
	var iii: String = str(p.get("the_coffers", "")).trim_prefix(cls)
	var fx: Dictionary = { "cls": cls, "order": str(ORDER.get(cls, "")), "crit": 0.0, "greenCrit": 0.0, "kegFree": false,
		"hp": 0.0, "dmgTaken": 0.0, "drawCut": 0.25, "heal": 0.0, "surgeryPct": 0.3, "surgeryShield": 0.0, "surgeryAll": false,
		"sail": 0.5, "coin": 0.0 }
	match cls:
		"master_gunner":
			fx["crit"] = 0.10
			if ii == "_ii_a":
				fx["crit"] = 0.15
			elif ii == "_ii_b":
				fx["greenCrit"] = 0.10
			if iii == "_iii_a":
				fx["kegFree"] = true
			elif iii == "_iii_b":
				fx["crit"] = 0.20
		"ironside":
			fx["hp"] = 0.15
			if ii == "_ii_a":
				fx["hp"] = 0.25
			elif ii == "_ii_b":
				fx["dmgTaken"] = 0.10
			if iii == "_iii_a":
				fx["hp"] = 0.50
			elif iii == "_iii_b":
				fx["drawCut"] = 0.50
		"surgeon":
			fx["heal"] = 0.10
			if ii == "_ii_a":
				fx["heal"] = 0.20
			elif ii == "_ii_b":
				fx["surgeryShield"] = 0.10
			if iii == "_iii_a":
				fx["surgeryAll"] = true
			elif iii == "_iii_b":
				fx["surgeryPct"] = 0.5
		"helmsman":
			fx["coin"] = 0.15
			if ii == "_ii_a":
				fx["sail"] = 0.75
			elif ii == "_ii_b":
				fx["coin"] = 0.25
			if iii == "_iii_a":
				fx["sail"] = 1.0
			elif iii == "_iii_b":
				fx["coin"] = 0.50
	return fx


## What the next chapter's Captain's Choice offers.
static func offered(picks: Variant) -> Array:
	var p: Dictionary = normalize(picks)
	var cls: String = str(p.get("thread", ""))
	if cls == "":
		return CLASSES.duplicate()
	if not p.has("sunken_hand"):
		return [cls + "_ii_a", cls + "_ii_b"]
	if not p.has("the_coffers"):
		return [cls + "_iii_a", cls + "_iii_b"]
	return []


## The order's one-line account, for the Special menu.
static func order_line(fx: Dictionary) -> String:
	match str(fx.get("order", "")):
		"powder_keg":
			return "Your next attack hits every enemy afloat" + (". Takes no turn" if fx.get("kegFree", false) else "")
		"draw_fire":
			return "2 rounds: aimed shots come at you, %d%% less" % int(round(float(fx["drawCut"]) * 100.0))
		"field_surgery":
			return ("Heal every ship %d%% of hull" if fx.get("surgeryAll", false) else "Heal a ship %d%% of hull") % int(round(float(fx["surgeryPct"]) * 100.0)) + (", and shield 10%" if float(fx.get("surgeryShield", 0.0)) > 0.0 else "")
		"full_sail":
			return "Each ship: a %d%% chance to load a ball" % int(round(float(fx["sail"]) * 100.0))
	return ""
