class_name CaptainCard
extends Dossier
## THE CAPTAIN'S LEDGER (Godot port of RaidCombat's PlayerStatsPopup): click
## your own plate in a fight (or a crewmate's, in a Charter's raid). A dossier
## (game/dossier.gd): the ship large on the left with the captain's avatar set
## into its corner; on the page the ship, the captain's name, the hull, the
## numbers (damage, crits, initiative, evasion, fortune), then the ship's
## class, the gear aboard and the Mega, the tides taken this raid, the crew's
## orders and which are spent, and what is on the ship right now.

var s: Dictionary = {}
var face: Texture2D
var mine: bool = true

const STATUS: Dictionary = {
	"weaken": ["Weakened", false, "Your shots deal %s less damage."],
	"feeble": ["Feeble", false, "You take %s more damage."],
	"marked": ["Marked", false, "Marked for death: you take %s more damage from all sources."],
	"slowed": ["Slowed", false, "You are %s slower in turn order."],
	"silence": ["Silenced", false, "Your crew's orders are locked."],
	"corrode": ["Corroded", false, "Your shield takes %s more damage."],
	"fortify": ["Fortified", true, "You take %s less damage."],
	"enrage": ["Enraged", true, "You deal %s more damage."],
	"regen": ["Mending", true, "You heal %s each round."],
}


func _ready() -> void:
	var sa: Dictionary = North.ship_art(s.get("tier"), s.get("shipSkin"))
	art = Skipper.tex(str(sa["art"]).trim_prefix("/"))
	badge = face
	ground = false
	disc = Color("#4f9a78")
	var ship: String = str(Js.obj(sa["def"]).get("name", "Ship"))
	lead = ("Your " if mine else "%s's " % s.get("name", "")) + ship.to_lower()
	title = str(s.get("name", "Captain"))
	hull = float(s.get("hp", 0.0))
	hull_max = float(s.get("max", 1.0))
	shield = float(s.get("shield", 0.0))
	hull_col = HELP
	var sm: float = float(s.get("shipMin", 1.0))
	var pmax: float = maxf(sm, float(Js.round(sm + 2.0 + floor(float(s.get("power", 0.0)) / 4.0))))
	var hit_min: float = maxf(sm, floor(pmax * 0.4))
	figures = [
		["%d–%d" % [int(hit_min), int(pmax)], "damage a hit"],
		["%d–%d" % [int(2.0 * sm), int(Js.round(pmax * 1.5))], "on a critical"],
		[str(int(s.get("speed", 0.0))), "initiative"],
		[str(int(s.get("nav", 0.0))), "evasion"],
		[str(int(s.get("fortune", 0.0))), "fortune"],
	]
	super._ready()


func _content() -> void:
	var cls: Array = Js.list(s.get("classes"))
	if not cls.is_empty():
		heading("Ship class", ", ".join(PackedStringArray(cls.map(func(c: Dictionary) -> String: return str(c["name"])))))
		var ch: Array = []
		for c: Dictionary in cls:
			for bl: Variant in Js.list(c.get("bullets")):
				ch.append([str(Js.obj(bl).get("label", "")), HELP if Js.obj(bl).get("positive", false) else HARM])
		chips(ch)
	var items: Array = Js.list(s.get("items"))
	var mg: Dictionary = Js.obj(s.get("mega"))
	if not items.is_empty() or not mg.is_empty():
		heading("Gear aboard")
		for id: Variant in items:
			var it: Dictionary = Armory.item(str(id))
			if it.is_empty():
				continue
			entry(str(it.get("name", "")), str(it.get("rarity", "")).to_lower(), str(it.get("description", "")))
		if not mg.is_empty():
			entry(str(mg.get("name", "")), "the Mega", "%s A full magazine of %d for x%s." % [str(mg.get("tagline", "")), int(Armory.aug()["megaCost"]), str(mg.get("megaMult", ""))])
	var tides: Array = Js.list(s.get("tidesTaken"))
	if not tides.is_empty():
		heading("Tides taken", "this raid")
		for t: Dictionary in tides:
			entry(str(t.get("label", "")), str(t.get("title", "")), str(t.get("description", "")))
	var crew: Array = Js.list(s.get("crew"))
	if not crew.is_empty():
		heading("Crew orders", "each once a raid")
		var used: Array = Js.list(s.get("used"))
		for c: Dictionary in crew:
			var cd: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
			var spent: bool = used.any(func(u: Variant) -> bool: return float(u) == float(c["id"]))
			entry(str(c["name"]), "%s%s" % [cd.get("name", ""), ", spent" if spent else ""], str(Js.obj(c.get("ms")).get("desc", "")), Color(str(cd.get("color", "#cccccc")), 0.35 if spent else 1.0))
	var now: Array = _now()
	if not now.is_empty():
		heading("Right now")
		for it2: Array in now:
			entry(it2[0], it2[1], it2[2], it2[3])


func _now() -> Array:
	var items: Array = []
	var st: Dictionary = Js.obj(s.get("statuses"))
	for id: String in st:
		var d: Array = STATUS.get(id, [id.capitalize(), false, "%s"])
		var m: float = Js.num(Js.obj(st[id]).get("mag"))
		var amt: String = ("%d%%" % int(round(m * 100.0))) if id not in ["slowed", "regen"] else str(int(m))
		var txt: String = (d[2] as String) % amt if (d[2] as String).contains("%s") else d[2]
		items.append([d[0], EnemyCard._turns(int(Js.num(Js.obj(st[id]).get("turns")))), txt, HELP if d[1] else HARM])
	var bn: Dictionary = Js.obj(s.get("burn"))
	if not bn.is_empty():
		items.append(["Ablaze", EnemyCard._turns(int(Js.num(bn.get("turns")))), "Your hull is on fire: %d at the end of each turn until a heal puts it out." % int(Js.num(bn.get("dmg"))), HARM])
	if s.get("frozenNow", false) or Js.num(s.get("freeze")) > 0.0:
		items.append(["Frozen", "", "Iced over: your next turn is skipped.", HARM])
	var w: Dictionary = Js.obj(s.get("ward"))
	if not w.is_empty() and Js.num(w.get("turns")) > 0.0:
		items.append(["Vengeance ward", EnemyCard._turns(int(Js.num(w["turns"]))), "The next blow that would sink you does not: you hold, and hit back harder.", HELP])
	var br: Dictionary = Js.obj(s.get("brace"))
	if not br.is_empty():
		items.append(["Braced", "", "The next hits on you are cut by %d%%." % int(round(Js.num(br.get("pct")) * 100.0)), HELP])
	var af: Dictionary = Js.obj(s.get("afflict"))
	if not af.is_empty():
		items.append([str(af.get("kind", "")).capitalize(), "%d shot%s" % [int(Js.num(af.get("passes"))), "" if int(Js.num(af.get("passes"))) == 1 else "s"], "Your aim bar is interfered with for your next shots.", HARM])
	var rp: Variant = s.get("repossessed")
	if rp != null:
		items.append(["Repossessed", "this fight", "The Quartermaster has taken back your %s." % Armory.item(str(rp)).get("name", "gear"), HARM])
	return items
