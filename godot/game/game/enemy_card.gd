class_name EnemyCard
extends Dossier
## THE ENEMY'S STAT CARD (Godot port of RaidCombat's EnemyStatsPopup; Kong,
## 2026-10-03: click an enemy for "their full art image like in the web game
## and their stats and statuses"; then "a full visual overhaul ... they look
## super AI especially with the accent color strips"). Laid out as a dossier
## (game/dossier.gd): its painting large on the left; on the page its rank,
## its name, its hull, its numbers (damage, volley, initiative, crits), then
## what it does (an elite's affix and every ability, in the web's words), a
## boss's phases as a timeline with the move each one telegraphs and what
## answers it, what is on it right now, and one fuzzy tell about how it fights
## (never the turn-by-turn pattern: reading that is the player's puzzle). The
## crate's odds are not here (Kong: they belong to the raid's entry).

## The fight's enemy (core/battle.gd b["enemy"]), its shown hull, and where
## it stands in the raid ("The Throne, fight 7 of 7").
var e: Dictionary = {}
var hp: float = 0.0
var portrait: Texture2D
var where: String = ""

const STATUS: Dictionary = {
	"weaken": ["Weakened", false, "deals %s less damage"],
	"feeble": ["Feeble", false, "takes %s more damage"],
	"marked": ["Marked", false, "is marked for death: takes %s more damage from all sources"],
	"slowed": ["Slowed", false, "is %s slower in turn order"],
	"silence": ["Silenced", false, "has its special abilities locked"],
	"corrode": ["Corroded", false, "takes %s more damage to its shield"],
	"fortify": ["Fortified", true, "takes %s less damage"],
	"enrage": ["Enraged", true, "deals %s more damage"],
	"regen": ["Mending", true, "heals %s each round"],
	"blinded": ["Blinded", false, "sees only near its needle"],
	"narrowed": ["Narrowed", false, "has a smaller mark to hit"],
}
const ROLE_DESC: Dictionary = {
	"shieldwright": "Every few turns it spends its turn throwing a barrier over its most hurt ally (or itself).",
	"sawbones": "Every few turns it spends its turn patching up its most hurt ally (or itself).",
	"hexer": "Every few turns it hexes a captain: Blinded (you see only near the needle) or Narrowed (a smaller mark to hit).",
	"rallier": "Every few turns it rallies its whole line: they hit harder for a while.",
	"breakwater": "It may throw itself in front of a shot aimed at an ally, taking the blow instead.",
}
const RESPONSE: Dictionary = { "brace": "a defensive one", "shield": "a defensive one", "snare": "a disrupting one", "heal": "a recovery one", "burst": "a heavy-hitting one" }


func _ready() -> void:
	var boss: bool = e.get("boss", false)
	var elite: bool = e.get("elite", false)
	art = portrait
	disc = Color("#e0a63a") if boss else (Color("#8b6cf0") if elite else Color("#4f8ea6"))
	lead = ("Boss" if boss else ("Elite" if elite else "Enemy")) + ("  ·  " + where if where != "" else "")
	title = str(e.get("name", ""))
	hull = hp
	hull_max = float(e.get("max", 1.0))
	shield = float(e.get("shield", 0.0))
	hull_col = HARM
	var mn: float = float(e.get("min", 0.0))
	var mx: float = float(e.get("maxDmg", 0.0))
	figures = [
		["%d–%d" % [int(mn), int(mx)], "damage a shot"],
		["%d–%d" % [int(mn * 2.0), int(mx * 2.0)], "a volley"],
		[str(int(e.get("speed", 0.0))), "initiative"],
		["%d%%" % int(round(float(e.get("crit", 0.0)) * 100.0)), "crit, %d–%d" % [int(floor(mn * 1.5)), int(floor(mx * 1.5))]],
	]
	super._ready()


func _content() -> void:
	# What it does.
	var does: Array = []
	if str(e.get("role", "")) != "":
		var rd: Dictionary = Js.obj(Battle.roles_cfg().get(str(e["role"])))
		does.append([str(rd.get("name", "")), "role", str(ROLE_DESC.get(str(e["role"]), ""))])
	var af: Dictionary = Js.obj(e.get("affix"))
	if not af.is_empty():
		does.append([str(af.get("name", "")), "elite affix", str(af.get("description", ""))])
	var dr: float = float(e.get("dr", 0.0))
	if dr > 0.0:
		var pct: int = int(round(dr * 100.0))
		does.append(["%s, %d%% off" % [e.get("drName", "Carapace"), pct], "ability", "Soaks %d%% off your fire and graze hits. Volleys punch through it for full damage." % pct])
	if float(e.get("fog", 0.0)) > 0.0 and str(e.get("fogName", "")) != "":
		does.append([str(e["fogName"]), "ability", "Fog drifts across your aim bar, hiding the gold center. Lock through the mist by rhythm and timing."])
	if float(e.get("critDrift", 0.0)) > 0.0:
		does.append([str(e.get("critDriftName", "")) if str(e.get("critDriftName", "")) != "" else "Rolling Plate", "ability", "Its armor plating rolls as it fights: the gold critical seam wanders the whole target zone, even out into the gray fringe. Hitting the seam always crits, but chasing it into the fringe is a wager: miss it by a hair out there and you only graze."])
	if float(e.get("parry", 0.0)) > 0.0:
		does.append([str(e.get("parryName", "Riposte")), "counter", "Counters a dodged strike for %d%% of his damage roll, %d%% of the time. Firing into his dodge is never safe." % [int(round(float(e.get("parryPct", 0.0)) * 100.0)), int(round(float(e["parry"]) * 100.0))]])
	if float(e.get("bite", 0.0)) > 0.0:
		does.append(["Shark's Bite", "ability", "When a shot lands on you, %d%% of the time it also tears a loaded cannonball off your rack. Dodging, bracing, or soaking it fully on shield spares the shot; a reload puts the cannonball back." % int(round(float(e["bite"]) * 100.0))])
	var sp: Dictionary = Js.obj(e.get("special"))
	if not sp.is_empty():
		does.append([str(sp.get("name", "")), "special", _special_desc(sp)])
	var ul: Dictionary = Js.obj(e.get("ultimate"))
	if not ul.is_empty():
		does.append([str(ul.get("name", "")), "ultimate", "At a full magazine it spends every cannonball at once for one massive blow, about %sx a normal shot. The pips glow full as the tell. Burn its charges down, brace, or shield before it fires." % str(Js.nz(ul.get("mult"), 2.6))])
	var tier: int = int(e.get("decoy", 0.0))
	if tier > 0:
		does.append(["Signal Flares", "ability", "Every few turns a screen of %d false flares goes up. Swat each amber flare before its fuse burns out. Every one you let through chips your hull.%s" % [3 + tier * 2, " Some glow red: those are live shells, so let them fizzle. Swatting a red flare hurts worse than missing an amber one." if tier >= 3 else ""]])
	if not does.is_empty():
		heading("What it does")
		for d: Array in does:
			entry(d[0], d[1], d[2])
	# A boss's phases.
	var ph: Array = Js.list(e.get("phases"))
	if not ph.is_empty():
		heading("Phases", "it falls, then rises again, meaner each time")
		var steps: Array = []
		for i: int in ph.size():
			var p: Dictionary = Js.obj(ph[i])
			var aside: String = "back at %d%% hull" % int(round(Js.num(p.get("revivePct")) * 100.0))
			if Js.num(p.get("damageMult")) > 1.0:
				aside += ", hits %d%% harder" % int(round((Js.num(p["damageMult"]) - 1.0) * 100.0))
			var lines: Array = []
			var chk: Dictionary = Js.obj(p.get("check"))
			if not chk.is_empty():
				lines.append(["“%s”  %s" % [chk.get("name", ""), chk.get("telegraph", "")], SOFT])
				var hint: String = str(chk.get("hint", ""))
				if hint == "":
					hint = _counter_cue(Js.list(chk.get("responses")))
				lines.append([hint, WARN, 600])
			steps.append({ "title": "Phase %d" % (i + 2), "aside": aside, "lines": lines })
		timeline(steps)
	# On it right now.
	var now: Array = _now()
	if not now.is_empty():
		heading("Right now")
		for it: Array in now:
			entry(it[0], it[1], it[2], it[3])
	heading("How it fights")
	_text(_list, _behavior(), "karla", 500, 14, SOFT, true)


## What is on it right now: [name, turns, what it means, its mark].
func _now() -> Array:
	var items: Array = []
	var ag: Dictionary = Js.obj(e.get("aegis"))
	if not ag.is_empty():
		items.append([str(ag.get("name", "The Last Wall")), "", "A wall of iron and will stands between your guns and his hull. Single shots glance off it whole. If anything can bring it down in one stroke, it is everything you have, all at once.", WARN])
	var st: Dictionary = Js.obj(e.get("statuses"))
	for id: String in st:
		var d: Array = STATUS.get(id, [id.capitalize(), false, "%s"])
		var m: float = Js.num(Js.obj(st[id]).get("mag"))
		var amt: String = ("%d%%" % int(round(m * 100.0))) if id not in ["slowed", "regen"] else str(int(m))
		var t: int = int(Js.num(Js.obj(st[id]).get("turns")))
		var txt: String = (d[2] as String) % amt if (d[2] as String).contains("%s") else d[2]
		items.append([d[0], _turns(t), "It " + txt + ".", HARM if d[1] else HELP])
	var bn: Dictionary = Js.obj(e.get("burn"))
	if not bn.is_empty():
		items.append(["Ablaze", _turns(int(Js.num(bn.get("turns")))), "Its hull is on fire. It loses %d HP at the end of each of its turns." % int(Js.num(bn.get("dmg"))), HELP])
	if e.get("frozenNow", false) or Js.num(e.get("freeze")) > 0.0:
		items.append(["Frozen", "", "Iced over. Its next turn is skipped, and it cannot weave aside from your shots while frozen.", HELP])
	var sn: Dictionary = Js.obj(e.get("snare"))
	if Js.num(sn.get("turns")) > 0.0:
		items.append(["Snared", _turns(int(Js.num(sn["turns"]))), "A snare fouls its rigging. Each time it tries to dodge, there is a chance the dodge fails and it must act instead.", HELP])
	if float(e.get("ward", 0.0)) > 0.0:
		items.append(["Vengeance ward", "", "The next blow that would sink it does not take: it holds at a fifth of its hull, then hits a quarter harder.", WARN])
	return items


static func _turns(t: int) -> String:
	return ("%d turn%s left" % [t, "" if t == 1 else "s"]) if t > 0 else ""


static func _special_desc(s: Dictionary) -> String:
	var turns: int = int(Js.nz(s.get("turns"), 2.0))
	var passes: int = int(Js.nz(s.get("aimPasses"), 2.0))
	var mag: float = Js.num(s.get("magnitude"))
	var pct: int = int(round(mag * 100.0))
	match str(s.get("aimAttack", "")):
		"decoys":
			return "Throws false gold across your aim bar for your next %d shots. Lock a decoy band and the shot misfires. Only the true mark scores." % passes
		"hardened":
			return "Plates your aim lock for your next %d shots, so it takes two taps to lock a shot instead of one." % passes
		"squall":
			return "Gusts your aim needle mid-sweep for your next %d shots, dragging the mark off line as you aim." % passes
	match str(s.get("status", "")):
		"fortify":
			return "Braces behind its own plating, taking %d%% less damage for %d turns. Wait out the braced window, or burst straight through it." % [pct, turns]
		"slowed":
			return "Fouls your rudder: -%d speed for %d turns, so you lose turn-order rolls and slip fewer shots." % [int(mag), turns]
		"weaken":
			return "Files down your guns: your shots deal %d%% less damage for %d turns." % [pct, turns]
		"feeble":
			return "Splits your seams: you take %d%% more damage for %d turns." % [pct, turns]
		"regen":
			return "Closes its own wounds, healing %d HP a turn for %d turns. Punish it with fast, heavy hits, not a slow trade." % [int(mag), turns]
		"silence":
			return "Silences your crew, locking their abilities for %d turns." % turns
	return str(s.get("line", ""))


static func _counter_cue(responses: Array) -> String:
	var cats: Array = []
	for r: Variant in responses:
		var c: String = str(RESPONSE.get(str(r), ""))
		if c != "" and not cats.has(c):
			cats.append(c)
	if cats.size() >= 4:
		return "Fire ANY crew ability to answer him. Somebody has to act."
	return "Fire a crew ability to counter it: %s." % " or ".join(PackedStringArray(cats))


## The web's enemyBehaviorHint: honest about WHAT it does, fuzzy about when.
func _behavior() -> String:
	var pat: Array = Js.list(e.get("pattern"))
	var n: int = maxi(1, pat.size())
	var c: Dictionary = { "reload": 0, "fire": 0, "volley": 0, "dodge": 0 }
	for a: Variant in pat:
		if c.has(str(a)):
			c[str(a)] = int(c[str(a)]) + 1
	var shots: int = int(c["fire"]) + int(c["volley"])
	var parts: Array = []
	if int(c["volley"]) >= 2:
		parts.append("Volley-happy. Lands more than one heavy volley a cycle.")
	elif int(c["volley"]) == 1:
		parts.append("Patient. Stacks charges, then lands a heavy volley." if int(c["reload"]) >= 2 else "Works a heavy volley in among its shots.")
		if int(c["fire"]) >= 3:
			parts.append("Trades shots freely in between.")
	elif shots > int(c["reload"]):
		parts.append("Aggressive. Trades shots constantly.")
	elif int(c["reload"]) > shots:
		parts.append("Methodical. Long reloads between strikes.")
	else:
		parts.append("Steady rhythm. Trades shot for shot.")
	if float(c["dodge"]) / float(n) >= 0.25 or int(c["dodge"]) >= 3:
		parts.append("Slippery, and weaves aside often.")
	return " ".join(PackedStringArray(parts))


