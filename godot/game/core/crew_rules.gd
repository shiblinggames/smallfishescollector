class_name CrewRules
extends RefCounted
## THE CREW, AS THE RULES SEE IT (Godot port, 2026-10-06). A rule that the
## crew of a Charter shares (the bounty board, the day's orders) asks here for
## every captain aboard: the open Charter sets `crew_of` (game/charter.gd), a
## solo captain is a crew of one. Only the founder's game runs the rules, so
## one Charter at a time is open here.

## uid -> [[CaptainStore, uid], ...] for that captain's whole crew (them
## included), or [] when they are in no crew.
static var crew_of: Callable = Callable()


static func of(db: CaptainStore, uid: String) -> Array:
	if crew_of.is_valid():
		var c: Array = crew_of.call(uid)
		if not c.is_empty():
			return c
	return [[db, uid]]


## The furthest Fishing level in the crew (a shared board is dealt for it).
static func top_fishing_level(db: CaptainStore, uid: String) -> float:
	var best: float = 1.0
	for m: Array in of(db, uid):
		var cdb: CaptainStore = m[0]
		best = maxf(best, float(Rules.level_from_xp(Js.num(cdb.me(str(m[1])).get("fishing_xp")))))
	return best
