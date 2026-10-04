class_name TackleRoom
extends Room
## THE TACKLE SHOP (Godot port of app/(app)/marketplace/tackle-shop/
## TackleShopClient.tsx, docking).
##
## The landing answers "what can I buy right now" before you touch anything:
## how kitted-out you are, a shelf of what is ready to buy, and a tile per
## category coloured by where it stands (ready, saving up, level locked, maxed,
## earned by play). Each tile opens its section: bait by the bundle, the hook
## and reel ladders (a press on the next rung buys it), the lines (earned by
## species, never bought), and the rod wall with its filters, Buy, Equip and
## Sell (asked twice), with the Completionist at the bottom. Every purchase is
## Harbour.*, the ported rules; a refusal shows above the section in red.

const CATS: Array = [
	["bait", "Bait", "#34d399", "worms.png"],
	["hook", "Hooks", "#f0c040", "hook_steel_thumb.png"],
	["rod", "Rods", "#b8956a", "rod_driftwood_thumb.png"],
	["reel", "Reels", "#60a5fa", "reel_basic_thumb.png"],
	["line", "Line", "#4ade80", "monofilament.png"],
	["hat", "Hats", "#c8a870", "hat_brown_rest.png"],
	["special", "Specials", "#c9a7ff", "autocaster.png"],
]
const PIP: Dictionary = {
	"ready": ["Ready to buy", "#f0c040"], "saving": ["Saving up", "#9a958c"], "locked": ["Level locked", "#60a5fa"],
	"maxed": ["Maxed", "#c9a7ff"], "earned": ["Earned by play", "#4ade80"],
}
const MECHANICS: Array = [
	["speed", "Faster bites"], ["rare", "Rare bias"], ["double", "Double catch"], ["zone", "Catch zone"],
	["retry", "Miss retry"], ["snag", "Snag immune"], ["jackpot", "Jackpot"], ["crate", "Crate odds"],
	["perfxp", "Perfect XP"], ["instant", "Instant bite"], ["wormhole", "Wormhole"],
]
const COMPLETIONIST_TIER: float = 14.0
const COMP_GIFTS: Array[String] = ["Always double catch", "50% miss retry", "Snag immune", "+50% rare bias", "+16° catch zone", "Perfect +5°", "Fastest bites"]

var section: String = ""
var _error: String = ""
var _ownership: String = "all"
var _mechanic: String = ""
var _sell_confirm: float = -1.0
var _busy: String = ""


func _init() -> void:
	title = "Tackle Shop"


func _backdrop() -> void:
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("tackle-shop-page-bg.jpg")
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(pic)
	var g: Gradient = Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.42, 1.0])
	g.colors = PackedColorArray([Color(0.024, 0.035, 0.055, 0.90), Color(0.024, 0.035, 0.055, 0.94), Color(0.02, 0.027, 0.043, 0.98)])
	var gt: GradientTexture2D = GradientTexture2D.new()
	gt.gradient = g
	gt.fill_to = Vector2(0, 1)
	var scrim: TextureRect = TextureRect.new()
	scrim.texture = gt
	scrim.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	scrim.stretch_mode = TextureRect.STRETCH_SCALE
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(scrim)


# ── What the captain has ───────────────────────────────────────────────────────

func _p() -> Dictionary:
	return session.profile()


func _lvl() -> int:
	return session.level()


func _dbl() -> float:
	return Js.num(_p().get("doubloons"))


func _tier(col_name: String) -> int:
	return int(Js.num(_p().get(col_name)))


func _req(rod: Dictionary) -> int:
	return int(((Rules.data()["rodShop"] as Dictionary)[Js.key(rod["tier"])] as Dictionary)["levelReq"])


## Every rod held, with the free Bamboo counted as always owned.
func _owned_rods() -> Dictionary:
	var out: Dictionary = {}
	for t: Variant in session.store.held_rod_tiers(session.uid):
		out[float(t)] = true
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["cost"]) == 0.0 and r.get("earnedOnly") != true and r.get("traderOnly") != true:
			out[float(r["tier"])] = true
	return out


static func speed_pct(rod: Dictionary) -> int:
	return int(Js.round((1.0 - Rules.rod_wait_mult(rod)) * 100.0))


## rodEffectLines: what a rod does, as short lines.
static func effect_lines(rod: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var dc: float = Js.num(rod.get("doubleCatchChance"))
	if dc >= 1.0:
		out.append("Always double catch")
	elif dc > 0.0:
		out.append("%d%% double catch" % int(Js.round(dc * 100.0)))
	var rt: float = Js.num(rod.get("retryOnMissChance"))
	if rt > 0.0:
		out.append("%d%% miss retry" % int(Js.round(rt * 100.0)))
	if rod.get("snagImmune") == true:
		out.append("Snag immune")
	if Js.num(rod.get("perfectZoneBonus")) > 0.0:
		out.append("Perfect zone +%s°" % Js.text(rod["perfectZoneBonus"]))
	if Js.num(rod.get("rarityBonus")) > 0.0:
		out.append("+%d%% rare bias" % int(Js.round(float(rod["rarityBonus"]) * 100.0)))
	if Js.num(rod.get("jackpotChance")) > 0.0:
		out.append("×%s jackpot · odds rise in shallows" % Js.text(rod.get("jackpotMultiplier")))
	if float(Js.nz(rod.get("crateChanceMult"), 1.0)) > 1.0:
		out.append("%s× crate odds" % Js.text(rod["crateChanceMult"]))
	if float(Js.nz(rod.get("perfectXpMult"), 1.0)) > 1.0:
		out.append("%s× perfect XP" % Js.text(rod["perfectXpMult"]))
	if Js.truthy(rod.get("wormhole")):
		out.append("Wormhole reroll")
	if Js.num(rod.get("instantBiteChance")) > 0.0:
		out.append("%d%% instant bite" % int(Js.round(float(rod["instantBiteChance"]) * 100.0)))
	if speed_pct(rod) > 0:
		out.append("%d%% faster bites" % speed_pct(rod))
	if Js.num(rod.get("catchZoneBonus")) > 0.0:
		out.append("+%s° catch zone" % Js.text(rod["catchZoneBonus"]))
	if out.is_empty():
		out.append("Standard rod")
	return out


static func has_mechanic(rod: Dictionary, key: String) -> bool:
	match key:
		"speed": return speed_pct(rod) > 0
		"rare": return Js.num(rod.get("rarityBonus")) > 0.0
		"double": return Js.num(rod.get("doubleCatchChance")) > 0.0
		"zone": return Js.num(rod.get("catchZoneBonus")) > 0.0
		"retry": return Js.num(rod.get("retryOnMissChance")) > 0.0
		"snag": return rod.get("snagImmune") == true
		"jackpot": return Js.num(rod.get("jackpotChance")) > 0.0
		"crate": return float(Js.nz(rod.get("crateChanceMult"), 1.0)) > 1.0
		"perfxp": return float(Js.nz(rod.get("perfectXpMult"), 1.0)) > 1.0
		"instant": return Js.num(rod.get("instantBiteChance")) > 0.0
		"wormhole": return Js.truthy(rod.get("wormhole"))
	return false


func _completionist() -> Dictionary:
	return Harbour.completionist_progress(session.store, session.uid)


# ── Each category's standing ───────────────────────────────────────────────────

func _state_for(next: Dictionary, req: int) -> Array:
	var level_ok: bool = _lvl() >= req
	var afford: bool = _dbl() >= float(next["cost"])
	var state: String = "locked" if not level_ok else ("ready" if afford else "saving")
	var detail: String
	if not level_ok:
		detail = "Fishing Lv %d · %d to go" % [req, req - _lvl()]
	elif afford:
		detail = "%s · %s ⟡" % [next["name"], Js.thousands(float(next["cost"]))]
	else:
		detail = "%s ⟡ short" % Js.thousands(float(next["cost"]) - _dbl())
	return [state, detail]


func _ladder(key: String, list_key: String, col_name: String) -> Dictionary:
	var list: Array = Rules.data()[list_key]
	var tier: int = _tier(col_name)
	var out: Dictionary = { "key": key, "owned": tier + 1, "total": list.size(), "next": {} }
	if tier + 1 >= list.size():
		out["state"] = "maxed"
		out["detail"] = "Fully upgraded"
		return out
	var next: Dictionary = list[tier + 1]
	var sd: Array = _state_for(next, int(next["levelReq"]))
	out["next"] = next
	out["state"] = sd[0]
	out["detail"] = sd[1]
	return out


func _summaries() -> Dictionary:
	var owned: Dictionary = _owned_rods()
	var rods: Array = Rules.data()["rods"]
	var buyable: Array = rods.filter(func(r: Dictionary) -> bool:
		return not owned.has(float(r["tier"])) and r.get("traderOnly") != true and float(r["tier"]) != COMPLETIONIST_TIER)
	buyable.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["cost"]) < float(b["cost"]))
	var next: Dictionary = {}
	for r: Dictionary in buyable:
		if _lvl() >= _req(r) and _dbl() >= float(r["cost"]):
			next = r
			break
	if next.is_empty():
		for r: Dictionary in buyable:
			if _lvl() >= _req(r):
				next = r
				break
	if next.is_empty() and not buyable.is_empty():
		next = buyable[0]
	var total: int = 0
	var have: int = 0
	for r: Dictionary in rods:
		if float(r["tier"]) != COMPLETIONIST_TIER:
			total += 1
			if owned.has(float(r["tier"])):
				have += 1
	var rod: Dictionary = { "key": "rod", "owned": have, "total": total, "next": next }
	if next.is_empty():
		rod["state"] = "maxed"
		rod["detail"] = "Every rod owned"
	else:
		var sd: Array = _state_for(next, _req(next))
		rod["state"] = sd[0]
		rod["detail"] = sd[1]
	var lines: Array = Rules.data()["lines"]
	var lt: int = _tier("line_tier")
	var sp: Dictionary = (_completionist()["all"] as Array)[1]
	var line: Dictionary = { "key": "line", "owned": lt + 1, "total": lines.size(), "next": {},
		"state": "maxed" if lt >= lines.size() - 1 else "earned",
		"detail": "Finest line unlocked" if lt >= lines.size() - 1 else "%d/%d species discovered" % [int(sp["have"]), int(sp["need"])] }
	var tin: float = 0.0
	var kinds: int = 0
	for k: Variant in session.save["bait"]:
		var n: float = Js.num((session.save["bait"] as Dictionary)[k])
		tin += n
		if n > 0:
			kinds += 1
	var bait: Dictionary = { "key": "bait", "owned": kinds, "total": (Rules.data()["baits"] as Array).size(), "next": {},
		"state": "ready", "detail": ("%d in your tin" % int(tin)) if tin > 0 else "Stock your tin" }
	# Hats: the ones for sale, the cheapest not yet owned next.
	var hats_owned: Array = Js.list(_p().get("unlocked_hats"))
	var sale: Array = (Rules.data()["hats"] as Array).filter(func(h: Dictionary) -> bool: return not h["crateOnly"])
	sale.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["cost"]) < float(b["cost"]))
	var hat_next: Dictionary = {}
	for h: Dictionary in sale:
		if not Js.includes(hats_owned, h["id"]):
			hat_next = h
			break
	var hat: Dictionary = { "key": "hat", "owned": hats_owned.size(), "total": (Rules.data()["hats"] as Array).size(), "next": hat_next }
	if hat_next.is_empty():
		hat["state"] = "maxed"
		hat["detail"] = "Every hat for sale owned"
	else:
		var hs: Array = _state_for(hat_next, 0)
		hat["state"] = hs[0]
		hat["detail"] = hs[1]
	# Specials: the Auto Caster for sale, the rest from voyages.
	var cols: Dictionary = Rules.data()["specialOwnedColumn"]
	var sp_have: int = 0
	var sp_total: int = 0
	for d: Dictionary in Rules.data()["specialItems"]:
		if d["finaleSlotOnly"]:
			continue
		sp_total += 1
		if _p().get(cols[d["id"]]) == true:
			sp_have += 1
	var special: Dictionary = { "key": "special", "owned": sp_have, "total": sp_total, "next": {} }
	var caster: Dictionary = Loadout._special("auto_caster")
	if _p().get("has_auto_caster") != true:
		var nx: Dictionary = { "name": caster["name"], "cost": float(caster["shopCost"]) }
		var cs: Array = _state_for(nx, 0)
		special["next"] = nx
		special["state"] = cs[0]
		special["detail"] = cs[1]
	else:
		special["state"] = "earned"
		special["detail"] = "%d of %d held" % [sp_have, sp_total]
	return { "hat": hat, "special": special, "rod": rod, "reel": _ladder("reel", "reels", "reel_tier"), "hook": _ladder("hook", "hooks", "hook_tier"), "line": line, "bait": bait }


# ── The page ───────────────────────────────────────────────────────────────────

func _badge() -> Control:
	var p: Pane = Kit.pane(null, { "radius": 10, "fill": [Kit.PAPER.lerp(Color(0.37, 0.92, 0.83), 0.15)], "border": [1, Color(Kit.ink(Color(0.37, 0.92, 0.83)), 0.5)], "shadow": [Color(0, 0, 0, 0.2), 6, Vector2(0, 2)], "pad": [10, 4, 10, 6], "paper": true })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 1)
	p.add_child(v)
	var a: Label = Room.text(v, "FISHING", 9, Color("#7fd4c4"))
	a.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var b: Label = Room.text(v, "Lv %d" % _lvl(), 16, Color("#5eead4"), true)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	if _lvl() < Rules.MAX_LEVEL:
		var table: Array = Rules.data()["xpTable"]
		var lo: float = float(table[_lvl() - 1])
		var hi: float = float(table[_lvl()])
		var bar: Control = Room.bar(v, (Js.num(_p().get("fishing_xp")) - lo) / maxf(1.0, hi - lo), Color("#5eead4"), 3.0)
		bar.custom_minimum_size = Vector2(44, 3)
		bar.size_flags_horizontal = Control.SIZE_SHRINK_END
	return p


func _back() -> void:
	if section != "":
		section = ""
		_error = ""
		_sell_confirm = -1.0
		back_label = "The Sea"
		title = "Tackle Shop"
		rebuild()
	else:
		close()


func _open(key: String) -> void:
	Rumble.buzz([0, 14])
	section = key
	_error = ""
	_sell_confirm = -1.0
	back_label = "Tackle Shop"
	for c: Array in CATS:
		if c[0] == key:
			title = c[1]
	rebuild()


func _build() -> void:
	if section == "":
		_landing()
		return
	if _error != "":
		Room.text(col, _error, 14, Color("#f87171"), false, true)
	match section:
		"bait": _bait()
		"hook": _ladder_list("hook")
		"reel": _ladder_list("reel")
		"line": _lines()
		"rod": _rods()
		"hat": _hats()
		"special": _specials()


func _landing() -> void:
	var sums: Dictionary = _summaries()
	var owned: int = 0
	var total: int = 0
	for k: String in sums:
		owned += int(sums[k]["owned"])
		total += int(sums[k]["total"])
	var pulse: HBoxContainer = HBoxContainer.new()
	col.add_child(pulse)
	var g: Label = Room.text(pulse, "GEAR  %d / %d" % [owned, total], 13, Color("#b9b2a6"))
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Room.text(pulse, "%s ⟡" % Js.thousands(_dbl()), 13, Color("#e0b45a"))
	var pb: Control = Room.bar(col, float(owned) / maxf(1.0, total), Color("#e0b45a"))
	pb.custom_minimum_size = Vector2(0, 6)

	var ready: Array = []
	for c: Array in CATS:
		var sm: Dictionary = sums[c[0]]
		if sm["state"] == "ready" and c[0] != "bait":
			ready.append([c, sm])
	if not ready.is_empty():
		Room.heading(col, "Ready to Buy", GOLD, 13)
		for pair: Array in ready:
			var c: Array = pair[0]
			var sm: Dictionary = pair[1]
			var b: Button = _surface_button(Color(0.94, 0.75, 0.25, 0.1), Color(0.94, 0.75, 0.25, 0.45), 64)
			b.pressed.connect(func() -> void: _open(c[0]))
			col.add_child(b)
			var h: HBoxContainer = _fill_row(b, 12)
			Room.picture(h, c[3], Vector2(52, 44))
			var v: VBoxContainer = VBoxContainer.new()
			v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			v.alignment = BoxContainer.ALIGNMENT_CENTER
			v.add_theme_constant_override("separation", 0)
			h.add_child(v)
			Room.text(v, (sm["next"] as Dictionary).get("name", c[1]), 15, INK, true)
			Room.text(v, c[1], 12, Color(c[2]))
			Room.text(h, "%s ⟡" % Js.thousands(float((sm["next"] as Dictionary)["cost"])), 15, GOLD, true)
			for l: Node in h.get_children():
				if l is Control:
					(l as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE

	Room.heading(col, "All Tackle", Color(0.75, 0.83, 0.89, 0.6), 13)
	var grid: GridContainer = Room.grid(col, 2, 10)
	var first: Button = null
	for c: Array in CATS:
		var sm: Dictionary = sums[c[0]]
		var accent: Color = Color(c[2])
		var is_ready: bool = sm["state"] == "ready" and c[0] != "bait"
		var b: Button = _tile(accent, "ready" if is_ready else "owned", 150)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void: _open(c[0]))
		grid.add_child(b)
		if first == null:
			first = b
		var v: VBoxContainer = VBoxContainer.new()
		v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		v.offset_top = 12
		v.offset_bottom = -12
		v.offset_left = 14
		v.offset_right = -14
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(v)
		Room.picture(v, c[3], Vector2(0, 76))
		var name_l: Label = Room.text(v, c[1], 17, INK, true)
		name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var pip: Array = PIP[sm["state"]]
		var d: Label = Room.text(v, "●  %s" % sm["detail"], 12, Color(pip[1]) if sm["state"] != "saving" else Color("#9a958c"))
		d.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		for l: Node in v.get_children():
			(l as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if first != null and get_viewport().gui_get_focus_owner() == null:
		first.grab_focus.call_deferred()


# ── Hats ───────────────────────────────────────────────────────────────────────

## Every bandana: the ones for sale with their price (a press buys it and puts
## it on), the crate-only ones marked as found in crates.
func _hats() -> void:
	var owned: Array = Js.list(_p().get("unlocked_hats"))
	var hats: Array = (Rules.data()["hats"] as Array).duplicate()
	hats.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a["crateOnly"] != b["crateOnly"]:
			return not a["crateOnly"]
		return float(a["cost"]) < float(b["cost"]))
	var grid: GridContainer = Room.grid(col, 3, 10)
	for h: Dictionary in hats:
		var id: String = h["id"]
		var have: bool = Js.includes(owned, id)
		var crate: bool = h["crateOnly"]
		var cost: float = float(h["cost"])
		var can: bool = not have and not crate and _dbl() >= cost
		var b: Button = _tile(Color("#c8a870"), "owned" if have else ("ready" if can else "locked"), 168)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(b)
		if can:
			b.pressed.connect(func() -> void: _do("hat-" + id, "buyHat", [id]))
		else:
			b.focus_mode = Control.FOCUS_NONE
		var v: VBoxContainer = VBoxContainer.new()
		v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		v.offset_top = 10
		v.offset_bottom = -10
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 4)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(v)
		Room.picture(v, h["restImageUrl"], Vector2(0, 84), not have and crate)
		var n: Label = Room.text(v, h["name"], 15, INK if have or not crate else Color("#9a958c"), true)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var line: String
		var tone: Color
		if have:
			line = "Owned  ·  wear it in the Locker"
			tone = Color("#4ade80")
		elif crate:
			line = "Found in fishing crates"
			tone = Color("#9a958c")
		elif _busy == "hat-" + id:
			line = "Buying…"
			tone = GOLD
		else:
			line = ("%s ⟡" % Js.thousands(cost)) if can else ("%s ⟡  ·  %s short" % [Js.thousands(cost), Js.thousands(cost - _dbl())])
			tone = GOLD if can else Color("#9a958c")
		var l: Label = Room.text(v, line, 12, tone)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		for c: Node in v.get_children():
			(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE


# ── Specials ───────────────────────────────────────────────────────────────────

## The specials: the Auto Caster for doubloons, its upgrade to the Auto
## Catcher for Fathoms (5 deep in Davy Jones' Gauntlet), and the ones that
## only come back from voyages, shown with where. One rides in the Locker's
## Special slot at a time.
func _specials() -> void:
	var p: Dictionary = _p()
	var cols: Dictionary = Rules.data()["specialOwnedColumn"]
	for d: Dictionary in Rules.data()["specialItems"]:
		if d["finaleSlotOnly"]:
			continue
		var id: String = d["id"]
		var info: Dictionary = Js.obj(Js.obj(Rules.data().get("specialInfo")).get(id))
		var accent: Color = Color(str(info.get("color", "#9aa3ad")))
		var have: bool = p.get(cols[id]) == true
		var fathoms: bool = d.get("costFathoms") != null
		var for_sale: bool = Js.truthy(d.get("shopCost")) or fathoms
		var why: String = ""
		if for_sale and not have:
			if Js.truthy(d.get("requiresItem")) and p.get(cols[d["requiresItem"]]) != true:
				why = "Buy the Auto Caster first"
			elif Js.truthy(d.get("requiresGauntletDepth")) and Js.num(p.get("gauntlet_deepest")) < float(d["requiresGauntletDepth"]):
				why = "Reach depth %d in Davy Jones' Gauntlet" % int(d["requiresGauntletDepth"])
		var cost: float = float(d["costFathoms"]) if fathoms else Js.num(d.get("shopCost"))
		var purse: float = Js.num(p.get("gauntlet_fathoms")) if fathoms else _dbl()
		var can: bool = for_sale and not have and why == "" and purse >= cost
		var b: Button = _tile(accent, "owned" if have else ("ready" if can else "locked"), 112)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_child(b)
		if can:
			b.pressed.connect(func() -> void: _do("sp-" + id, "buySpecialItem", [id], ["equipSpecialItem", ["auto_caster" if id == "auto_catcher" else id]]))
		else:
			b.focus_mode = Control.FOCUS_NONE
		var h: HBoxContainer = _fill_row(b, 14)
		Room.picture(h, str(info.get("image", "")), Vector2(72, 72), not have)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 2)
		h.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		v.add_child(top)
		Room.text(top, d["name"], 16, INK if have else Color("#cfcabf"), true)
		if have:
			_status_pill(top, "Owned", Color("#4ade80"))
		Room.text(v, str(info.get("description", "")), 13, Color("#9a958c"), false, true).custom_minimum_size = Vector2(0, 0)
		var chips: HBoxContainer = HBoxContainer.new()
		chips.add_theme_constant_override("separation", 6)
		v.add_child(chips)
		Room.chip(chips, str(info.get("effect", "")), Color(accent, 0.85), Color(accent, 0.09), Color(accent, 0.22))
		if not have:
			if not for_sale:
				Room.chip(chips, ("Comes back from %s" % info["obtainedFrom"]) if info.has("obtainedFrom") else "Not sold", Color("#9a958c"), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))
			elif why != "":
				Room.chip(chips, why, Color("#e8c98a"), Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.2))
			elif _busy == "sp-" + id:
				Room.chip(chips, "Buying…", GOLD, Color(0.94, 0.75, 0.25, 0.1), Color(0.94, 0.75, 0.25, 0.3))
			elif not can:
				Room.chip(chips, "%s %s short" % [Js.thousands(cost - purse), "Fathoms" if fathoms else "⟡"], Color("#9a958c"), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))
			if for_sale:
				Room.text(h, ("%s Fathoms" % Js.thousands(cost)) if fathoms else ("%s ⟡" % Js.thousands(cost)), 15, GOLD if can else Color("#6a6764"), true)
		for c: Node in h.get_children():
			(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	Room.text(col, "One special rides with you at a time: choose it in the Locker's Special slot.", 13, Color("#9a958c"), false, true)


# ── Bait ───────────────────────────────────────────────────────────────────────

func _bait() -> void:
	var grid: GridContainer = Room.grid(col, 2, 10)
	for b: Dictionary in Rules.data()["baits"]:
		var accent: Color = Color(b["color"])
		var p: Pane = Pane.new(Kit.tile(accent, "owned"))
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(p)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 6)
		p.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 10)
		v.add_child(top)
		Room.picture(top, b.get("imageUrl"), Vector2(48, 48))
		var names: VBoxContainer = VBoxContainer.new()
		names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		names.add_theme_constant_override("separation", 2)
		top.add_child(names)
		Room.text(names, b["name"], 15, INK, true)
		var held: float = Js.num((session.save["bait"] as Dictionary).get(b["type"]))
		Room.chip(names, "×%d in hold" % int(held), Color("#d6d0c4"), Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.15))
		var chips: HFlowContainer = HFlowContainer.new()
		chips.add_theme_constant_override("h_separation", 5)
		v.add_child(chips)
		var faster: bool = float(b["waitMult"]) < 1.0
		var zone: bool = float(b["catchZoneBonus"]) > 0.0
		if faster:
			Room.chip(chips, "%d%% faster" % int(Js.round((1.0 - float(b["waitMult"])) * 100.0)), Color("#d6d0c4"), Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.15))
		if zone:
			Room.chip(chips, "+%s° zone" % Js.text(b["catchZoneBonus"]), Color("#d6d0c4"), Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.15))
		if not faster and not zone:
			Room.chip(chips, "no penalty", Color(1, 1, 1, 0.3), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))
		if b["type"] == "worm":
			Room.chip(chips, "20 free/day", Color("#4ade80"), Color(0.29, 0.87, 0.5, 0.1), Color(0.29, 0.87, 0.5, 0.25))
		if b.get("hint") != null:
			var hint: Label = Room.text(v, b["hint"], 12, Color("#a0a09a"), false, true)
			hint.custom_minimum_size = Vector2(0, 0)
			hint.add_theme_font_override("font", BuyerPanel._italic())
		var cost: float = float(b["shopCost"])
		if cost <= 0.0:
			var how: String = "Voyages, or buy with Fathoms in the Locker" if Js.includes(b["acquisition"], "fathoms") else "Earned from voyages"
			Room.text(v, how, 12, Color("#9a958c"), false, true).custom_minimum_size = Vector2(0, 0)
			continue
		# Locked behind a Fishing level (the port's rules).
		var locked: String = Rules.gate_block("bait", b["type"], Js.num(session.profile().get("fishing_xp")))
		if locked != "":
			v.modulate.a = 0.7
			Room.chip(v, "Locked  ·  %s" % locked, Color("#e8c98a"), Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.2))
			continue
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		v.add_child(row)
		for q: int in [10, 25]:
			var price: float = cost * q
			var can: bool = _dbl() >= price
			var key: String = "%s-%d" % [b["type"], q]
			var btn: Button = Room.tinted("…" if _busy == key else "×%d   %s ⟡" % [q, Js.thousands(price)], accent if can else GOLD, 13, 36)
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if not can:
				btn.add_theme_stylebox_override("normal", Room.box(Color(0.05, 0.06, 0.08, 0.95), Color(1, 1, 1, 0.1), 10, 0))
			btn.pressed.connect(func() -> void: _do(key, "buyBait", [b["type"], float(q)]))
			row.add_child(btn)


# ── Hooks and reels ────────────────────────────────────────────────────────────

func _ladder_list(kind: String) -> void:
	var list: Array = Rules.data()["hooks" if kind == "hook" else "reels"]
	var tier: int = _tier("hook_tier" if kind == "hook" else "reel_tier")
	var accent: Color = Color("#f0c040") if kind == "hook" else Color("#60a5fa")
	for item: Dictionary in list:
		var t: int = int(item["tier"])
		var owned: bool = t <= tier
		var active: bool = t == tier
		var next: bool = t == tier + 1
		var locked: bool = t > tier + 1
		var req: int = int(item["levelReq"])
		var level_ok: bool = _lvl() >= req
		var afford: bool = next and _dbl() >= float(item["cost"])
		var b: Button = _tile(accent, "active" if active else ("owned" if owned else ("ready" if next and level_ok and afford else "locked")), 92)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_child(b)
		if next:
			b.pressed.connect(func() -> void:
				_do("tier", "buyHook" if kind == "hook" else "buyReel", []))
		else:
			b.focus_mode = Control.FOCUS_NONE
		var h: HBoxContainer = _fill_row(b, 14)
		var thumb: String = String(item.get("imageUrl", "")).replace(".png", "_thumb.png")
		Room.picture(h, thumb, Vector2(64, 64), not owned)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 2)
		h.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		v.add_child(top)
		Room.text(top, item["name"], 16, INK if owned else Color("#cfcabf"), true)
		if active:
			_status_pill(top, "Active", Color("#5fd9bd"))
		elif owned:
			_status_pill(top, "Owned", Color("#4ade80"))
		elif locked:
			_status_pill(top, "Locked", Color("#7a7775"))
		Room.text(v, item.get("description", ""), 13, Color("#9a958c") if owned else Color("#6a655d"), false, true).custom_minimum_size = Vector2(0, 0)
		var chips: HBoxContainer = HBoxContainer.new()
		chips.add_theme_constant_override("separation", 6)
		v.add_child(chips)
		var effect: String
		var good: bool
		if kind == "hook":
			effect = "+%d° catch zone" % (t * 3)
			good = t > 0
		else:
			var slower: int = int(Js.round((1.0 - float(item["needleSpeedMultiplier"])) * 100.0))
			effect = "Needle %d%% slower" % slower if slower > 0 else "Base speed"
			good = slower > 0
		if owned and good:
			Room.chip(chips, effect, Color(accent, 0.8), Color(accent, 0.09), Color(accent, 0.22))
		else:
			Room.chip(chips, effect, Color("#9a958c") if owned else Color("#5a564e"), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))
		if next:
			var chip: String = "Upgrading…" if _busy == "tier" else ("Fishing Lv %d · %d to go" % [req, req - _lvl()] if not level_ok else ("Press to upgrade" if afford else "%s ⟡ short" % Js.thousands(float(item["cost"]) - _dbl())))
			Room.chip(chips, chip.to_upper(), GOLD if afford and level_ok else Color("#9a958c"), Color(0.94, 0.75, 0.25, 0.1) if afford and level_ok else Color(0.06, 0.07, 0.09, 0.9), Color(0.94, 0.75, 0.25, 0.3) if afford and level_ok else Color(1, 1, 1, 0.1), 10)
		if not owned:
			Room.text(h, "%s ⟡" % Js.thousands(float(item["cost"])), 15, GOLD if next else Color("#6a6764"), true)
		for c: Node in h.get_children():
			(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if tier >= list.size() - 1:
		var done: Label = Room.text(col, "You have the best hook in the sea." if kind == "hook" else "You have the finest reel in the sea.", 14, Color("#c9a7ff"))
		done.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _status_pill(parent: Control, t: String, c: Color) -> void:
	Kit.chip(parent, t, c)


# ── Lines ──────────────────────────────────────────────────────────────────────

func _lines() -> void:
	var banner: PanelContainer = Room.panel(col, Room.box(Color(0.29, 0.87, 0.5, 0.07), Color(0.29, 0.87, 0.5, 0.25), 12, 12))
	Room.text(banner, "Lines are earned by catching unique species. No purchase needed.", 14, Color("#bfe8cc"), false, true)
	var lt: int = _tier("line_tier")
	var accent: Color = Color("#4ade80")
	for line: Dictionary in Rules.data()["lines"]:
		var t: int = int(line["tier"]) if line.has("tier") else (Rules.data()["lines"] as Array).find(line)
		var owned: bool = t <= lt
		var p: Pane = Pane.new(Kit.tile(Color(line.get("color", "#4ade80")), "active" if t == lt else ("owned" if owned else "locked")))
		col.add_child(p)
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 14)
		p.add_child(h)
		Room.picture(h, line.get("imageUrl"), Vector2(56, 56), not owned)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 2)
		h.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		v.add_child(top)
		Room.text(top, line["name"], 16, INK if owned else Color("#cfcabf"), true)
		if t == lt:
			_status_pill(top, "Active", Color("#5fd9bd"))
		elif owned:
			_status_pill(top, "Owned", Color("#4ade80"))
		else:
			_status_pill(top, "Locked", Color("#7a7775"))
		Room.text(v, line.get("description", ""), 13, Color("#9a958c") if owned else Color("#6a655d"), false, true).custom_minimum_size = Vector2(0, 0)
		var chips: HBoxContainer = HBoxContainer.new()
		chips.add_theme_constant_override("separation", 6)
		v.add_child(chips)
		var smaller: int = int(Js.round((1.0 - float(line["penaltyMultiplier"])) * 100.0))
		var eff: String = "Snag zones %d%% smaller" % smaller if smaller > 0 else "Standard snag zones"
		if owned and smaller > 0:
			Room.chip(chips, eff, Color(accent, 0.8), Color(accent, 0.09), Color(accent, 0.22))
		else:
			Room.chip(chips, eff, Color("#9a958c") if owned else Color("#5a564e"), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))
		if not owned:
			Room.chip(chips, "%d species to unlock" % int(line["unlockAt"]), Color("#9a958c"), Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.1))


# ── Rods ───────────────────────────────────────────────────────────────────────

func _rods() -> void:
	var owned: Dictionary = _owned_rods()
	var rods: Array = (Rules.data()["rods"] as Array).filter(func(r: Dictionary) -> bool: return r.get("earnedOnly") != true and r.get("traderOnly") != true)
	rods.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["cost"]) < float(b["cost"]))
	var n_owned: int = rods.filter(func(r: Dictionary) -> bool: return owned.has(float(r["tier"]))).size()

	var f1: HBoxContainer = HBoxContainer.new()
	f1.add_theme_constant_override("separation", 6)
	col.add_child(f1)
	for o: Array in [["all", "All", rods.size()], ["owned", "Owned", n_owned], ["unowned", "Not owned", rods.size() - n_owned]]:
		var b: Button = Room.tinted("%s  %d" % [o[1], o[2]], GOLD if _ownership == o[0] else Color("#8a95a0"), 12, 30)
		b.pressed.connect(func() -> void:
			_ownership = o[0]
			rebuild())
		f1.add_child(b)
	var f2: HFlowContainer = HFlowContainer.new()
	f2.add_theme_constant_override("h_separation", 6)
	f2.add_theme_constant_override("v_separation", 6)
	col.add_child(f2)
	var allm: Button = Room.tinted("All abilities", GOLD if _mechanic == "" else Color("#8a95a0"), 12, 28)
	allm.pressed.connect(func() -> void:
		_mechanic = ""
		rebuild())
	f2.add_child(allm)
	for m: Array in MECHANICS:
		if rods.filter(func(r: Dictionary) -> bool: return has_mechanic(r, m[0])).is_empty():
			continue
		var b: Button = Room.tinted(m[1], GOLD if _mechanic == m[0] else Color("#8a95a0"), 12, 28)
		b.pressed.connect(func() -> void:
			_mechanic = "" if _mechanic == m[0] else m[0]
			rebuild())
		f2.add_child(b)

	var list: Array = rods.filter(func(r: Dictionary) -> bool:
		var o: bool = owned.has(float(r["tier"]))
		if _ownership == "owned" and not o:
			return false
		if _ownership == "unowned" and o:
			return false
		return _mechanic == "" or has_mechanic(r, _mechanic))
	if list.is_empty():
		Room.text(col, "No rods match these filters.", 14, SUB)
		var clear: Button = Room.tinted("Clear filters", Color("#b9c6d0"), 13, 34)
		clear.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		clear.pressed.connect(func() -> void:
			_ownership = "all"
			_mechanic = ""
			rebuild())
		col.add_child(clear)
	for r: Dictionary in list:
		_rod_row(r, owned.has(float(r["tier"])))
	_completionist_card(owned)


func _rod_row(rod: Dictionary, owned: bool) -> void:
	var tier: float = float(rod["tier"])
	var equipped: bool = float(_tier("rod_tier")) == tier
	var accent: Color = Color(rod.get("color", "#b8956a"))
	var p: Pane = Pane.new(Kit.tile(accent, "active" if equipped else ("owned" if owned else "locked"), [1, 1, 14, 1]))
	col.add_child(p)
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	p.add_child(h)
	# The art well: a darker pool the rod lies in.
	var art: Pane = Pane.new({ "radius": 14, "fill": [Color(0.016, 0.024, 0.04, 0.5)], "glow": [Color(accent, 0.12), Vector2(0.5, 0.5), Vector2(0.7, 0.7)], "pad": 6 })
	art.custom_minimum_size = Vector2(104, 0)
	h.add_child(art)
	Room.picture(art, "%s_thumb.png" % rod.get("slug", ""), Vector2(92, 92), not owned)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 4)
	h.add_child(v)
	var pad: Control = Control.new()
	pad.custom_minimum_size = Vector2(0, 4)
	v.add_child(pad)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	v.add_child(top)
	Room.text(top, "●", 11, accent).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Room.text(top, rod["name"], 16, INK if owned else Color("#cfcabf"), true)
	if equipped:
		_status_pill(top, "Equipped", Color("#5fd9bd"))
	elif owned:
		_status_pill(top, "Owned", Color("#4ade80"))
	var chips: HFlowContainer = HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 5)
	chips.add_theme_constant_override("v_separation", 5)
	v.add_child(chips)
	for e: String in effect_lines(rod):
		Room.chip(chips, e, Color(accent, 0.85) if owned else Color("#8a857c"), Color(accent, 0.08), Color(accent, 0.22))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	v.add_child(row)
	var busy: bool = _busy == "rod%s" % Js.key(tier)
	if not owned:
		var req: int = _req(rod)
		var btn: Button
		if _lvl() < req:
			btn = Room.tinted("Fishing Lv %d · %d to go" % [req, req - _lvl()], Color("#60a5fa"), 13, 36)
			btn.disabled = true
		elif _dbl() >= float(rod["cost"]):
			btn = Room.tinted("…" if busy else "Buy · %s ⟡" % Js.thousands(float(rod["cost"])), GOLD, 13, 36)
			btn.pressed.connect(func() -> void:
				_do("rod%s" % Js.key(tier), "purchaseRod", [tier], ["equipTackleRod", [tier]]))
		else:
			btn = Room.tinted("Need %s ⟡" % Js.thousands(float(rod["cost"]) - _dbl()), Color("#9a958c"), 13, 36)
			btn.disabled = true
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(btn)
	else:
		if not equipped:
			var eq: Button = Room.tinted("…" if busy else "Equip", Color("#f0ede8"), 13, 36)
			eq.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			eq.pressed.connect(func() -> void: _do("rod%s" % Js.key(tier), "equipTackleRod", [tier]))
			row.add_child(eq)
		if float(rod["cost"]) > 0.0:
			var refund: float = floor(float(rod["cost"]) * float(Rules.data()["rodSellRate"]))
			var confirm: bool = _sell_confirm == tier
			var sell: Button = Room.tinted("Sure? +%s ⟡" % Js.thousands(refund) if confirm else "Sell", Color("#f87171") if confirm else Color("#b9b2a6"), 13, 36)
			sell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			sell.pressed.connect(func() -> void:
				if _sell_confirm != tier:
					_sell_confirm = tier
					rebuild()
					return
				_sell_confirm = -1.0
				_do("rod%s" % Js.key(tier), "sellRod", [tier]))
			row.add_child(sell)
	var pad2: Control = Control.new()
	pad2.custom_minimum_size = Vector2(0, 6)
	v.add_child(pad2)


func _completionist_card(owned: Dictionary) -> void:
	var rod: Dictionary = Rules.rod(COMPLETIONIST_TIER)
	var c: Color = Color(rod.get("color", "#c9a7ff"))
	var have: bool = session.store.rod_held(session.uid, "completionist") > 0.0
	var prog: Dictionary = _completionist()
	var eligible: bool = prog["eligible"]
	var p: Pane = Pane.new(Kit.tile(c, "owned" if have else ("active" if eligible else "locked")))
	col.add_child(p)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	v.add_child(top)
	if have:
		var active: bool = float(_tier("rod_tier")) == COMPLETIONIST_TIER
		Room.text(top, rod["name"], 17, Color("#f0ede8"), true)
		Room.chip(top, "MASTERY", c, Color(c, 0.12), Color(c, 0.25), 9)
		var sp: Control = Control.new()
		sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(sp)
		Room.text(top, "EQUIPPED" if active else "OWNED", 11, c if active else Color("#4ade80"))
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		v.add_child(row)
		var view: Button = Room.tinted("View Rod", c, 13, 36)
		view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		view.pressed.connect(_view_completionist)
		row.add_child(view)
		if not active:
			var eq: Button = Room.tinted("Equip", Color("#f0ede8"), 13, 36)
			eq.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			eq.pressed.connect(func() -> void: _do("rod14", "equipTackleRod", [COMPLETIONIST_TIER]))
			row.add_child(eq)
		else:
			var inuse: Label = Room.text(row, "IN USE", 12, Color("#5fd9bd"))
			inuse.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			inuse.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_effect_forge(v, c)
		return
	if eligible:
		Room.text(top, "★", 15, c)
	Room.text(top, "Ready to Claim" if eligible else "Completionist Rod", 17, Color("#f0ede8") if eligible else Color("#6a6764"), true)
	Room.chip(top, "MASTERY", c if eligible else Color("#4a4845"), Color(c, 0.1) if eligible else Color(0.06, 0.07, 0.09, 0.9), Color(c, 0.2) if eligible else Color(1, 1, 1, 0.1), 9)
	Room.text(v, "You've seen it all. Something extraordinary is waiting for you." if eligible else "The sea hides its greatest secret from those who haven't seen everything it holds.", 13, Color("#a0a09a") if eligible else Color("#6a6764"), false, true).custom_minimum_size = Vector2(0, 0)
	for r: Dictionary in prog["all"]:
		var done: bool = r["done"]
		var lr: HBoxContainer = HBoxContainer.new()
		v.add_child(lr)
		var ll: Label = Room.text(lr, String(r["label"]).to_upper(), 11, Color("#4ade80") if done else Color("#6a6764"))
		ll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Room.text(lr, "%d / %d" % [int(r["have"]), int(r["need"])], 11, Color("#4ade80") if done else Color("#6a6764"))
		Room.bar(v, float(r["have"]) / maxf(1.0, float(r["need"])), Color("#4ade80") if done else Color(c, 0.5), 3.0)
	if eligible:
		var claim: Button = Room.tinted("Claiming…" if _busy == "claim" else "Claim Your Reward", c, 14, 40)
		claim.pressed.connect(_claim)
		v.add_child(claim)


## THE EFFECT FORGE (Loadout.set_completionist_effects): up to three owned
## rods' own effects forged into the Completionist. The first forge is free;
## changing it after costs the reforge price.
var _comp_pick: Variant = null


func _effect_forge(v: VBoxContainer, c: Color) -> void:
	var comp: Dictionary = Rules.data()["completionist"]
	var cap: int = int(comp["maxEffects"])
	var current: Array = Js.list(_p().get("completionist_effects"))
	if _comp_pick == null:
		_comp_pick = current.duplicate()
	var pick: Array = _comp_pick
	Room.heading(v, "Forge in up to %d rods' own effects" % cap, c, 12)
	var held: Array = session.store.held_rod_tiers(session.uid)
	var any: bool = false
	for r: Dictionary in Rules.data()["rods"]:
		var t: float = float(r["tier"])
		if not Js.includes(held, t) or not Rules.rod_has_unique_effect(r):
			continue
		any = true
		var on: bool = Js.includes(pick, t)
		var b: Button = Room.tinted(("✓  " if on else "") + str(r["name"]) + "  ·  " + _rod_gift(r), c if on else Color("#8a95a0"), 12, 32)
		b.disabled = not on and pick.size() >= cap
		b.pressed.connect(func() -> void:
			if Js.includes(pick, t):
				pick.erase(t)
			elif pick.size() < cap:
				pick.append(t)
			rebuild())
		v.add_child(b)
	if not any:
		Room.text(v, "Own rods with an effect of their own (a double catch, a jackpot, a wormhole) to forge them in.", 12, SUB, false, true)
		return
	var same: bool = pick.size() == current.size() and pick.all(func(x: Variant) -> bool: return Js.includes(current, x))
	var seen: bool = Js.truthy(_p().get("has_seen_forge_flourish"))
	var cost: String = "free" if not seen else "%s ⟡" % Js.thousands(float(comp["reforgeCost"]))
	var fb: Button = Room.tinted("Forging…" if _busy == "compfx" else ("Pick up to %d above" % cap if pick.is_empty() else ("Forged in" if same else "Forge these in  ·  %s" % cost)), c, 13, 38)
	fb.disabled = same or pick.is_empty()
	fb.pressed.connect(func() -> void:
		_do("compfx", "setCompletionistEffects", [pick.duplicate()])
		_comp_pick = null)
	v.add_child(fb)


## A rod's own effect, in a few words.
func _rod_gift(r: Dictionary) -> String:
	var g: Array = []
	if Js.num(r.get("doubleCatchChance")) > 0:
		g.append("%d%% double catch" % int(round(Js.num(r["doubleCatchChance"]) * 100.0)))
	if Js.num(r.get("retryOnMissChance")) > 0:
		g.append("%d%% miss retry" % int(round(Js.num(r["retryOnMissChance"]) * 100.0)))
	if Js.num(r.get("rarityBonus")) > 0:
		g.append("rare bias")
	if Js.num(r.get("jackpotChance")) > 0:
		g.append("jackpot")
	if float(Js.nz(r.get("crateChanceMult"), 1.0)) > 1.0:
		g.append("crate odds x%s" % Js.text(r["crateChanceMult"]))
	if float(Js.nz(r.get("perfectXpMult"), 1.0)) > 1.0:
		g.append("perfect XP x%s" % Js.text(r["perfectXpMult"]))
	if Js.truthy(r.get("wormhole")):
		g.append("wormhole")
	if Js.num(r.get("instantBiteChance")) > 0:
		g.append("instant bites")
	return ", ".join(g)


func _claim() -> void:
	if _busy != "":
		return
	_busy = "claim"
	var r: Dictionary = await session.act("claimCompletionistRod")
	_busy = ""
	if r.has("error"):
		_error = r["error"]
		rebuild()
		return
	session.persist()
	Rumble.buzz([0, 55, 70, 45, 90, 60])
	Sound.chest(true)
	rebuild()
	var reveal: CompletionistReveal = CompletionistReveal.new()
	reveal.gifts = COMP_GIFTS
	reveal.rod_name = String(Rules.rod(COMPLETIONIST_TIER)["name"])
	add_child(reveal)


func _view_completionist() -> void:
	var rod: Dictionary = Rules.rod(COMPLETIONIST_TIER)
	var sh: Sheet = Sheet.new()
	sh.title = rod["name"]
	sh.blurb = "Mastery"
	sh.ready.connect(func() -> void:
		Room.picture(sh.body, "rod_completionist_thumb.png", Vector2(0, 160))
		for g: String in COMP_GIFTS:
			sh.stat(g, "✓", "good")
		if float(_tier("rod_tier")) == COMPLETIONIST_TIER:
			sh.note("Currently equipped")
		else:
			var eq: Button = Kit.button("Equip", "accent", "large", Kit.GOLD)
			eq.pressed.connect(func() -> void:
				sh.close()
				_do("rod14", "equipTackleRod", [COMPLETIONIST_TIER]))
			sh.body.add_child(eq))
	add_child(sh)


# ── Doing things ───────────────────────────────────────────────────────────────

## Run one purchase (a rules call by name, and one to follow it if it lands,
## as buying a rod puts it in hand): tap on the press, the refusal above the
## section or the commit bump and a fresh page when it lands.
func _do(key: String, op: String, args: Array, then: Array = []) -> void:
	if _busy != "":
		return
	_error = ""
	Rumble.tap(10)
	_busy = key
	rebuild()
	var r: Dictionary = await session.act(op, args)
	if not r.has("error") and not then.is_empty():
		await session.act(then[0], then[1])
	_busy = ""
	if not is_inside_tree():
		return
	if r.has("error"):
		_error = r["error"]
	else:
		session.persist()
		Rumble.tap(24)
	rebuild()


# ── Surfaces ───────────────────────────────────────────────────────────────────

## A tile you press: the kit's tile surface, brighter on hover.
func _tile(c: Color, kind: String, h: float) -> Button:
	var n: Dictionary = Kit.tile(c, kind, 0)
	var hot: Dictionary = n.duplicate()
	var fill: Array = n["fill"]
	hot["fill"] = [Color(fill[0]).lightened(0.06), Color(fill[fill.size() - 1]).lightened(0.04)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, hot)
	b.custom_minimum_size = Vector2(0, h)
	Kit.tap(b)
	return b


## A gold-washed row (the Ready to Buy shelf).
func _surface_button(bg: Color, border: Color, h: float) -> Button:
	var n: Dictionary = { "radius": 14, "fill": [Color(bg, bg.a * 1.5), Color(bg, bg.a * 0.5)], "border": [1, border], "sheen": 0.04, "pad": 0 }
	var hot: Dictionary = n.duplicate()
	hot["fill"] = [Color(bg, bg.a * 2.4), Color(bg, bg.a)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, hot)
	b.custom_minimum_size = Vector2(0, h)
	Kit.tap(b)
	return b


## A row laid over a button, filling it, that lets presses through.
func _fill_row(b: Button, pad: int) -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	h.offset_left = pad
	h.offset_right = -pad
	h.offset_top = 8
	h.offset_bottom = -8
	h.add_theme_constant_override("separation", 12)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(h)
	return h
