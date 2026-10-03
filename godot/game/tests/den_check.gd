extends SceneTree
## THE DEN'S PORT RULES, through the rules (Godot port): the buy-in cap by
## Fishing level, roulette and blackjack waiting on their levels, the fixed
## 300x Catfish Jackpot (no pot fed or taken), and the machine's return over
## a long run (about 90% by exact enumeration).
##
##   godot --headless --path godot/game -s tests/den_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://den_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var db: CaptainStore = sea.session.store
	var uid: String = sea.session.uid
	var prof: Dictionary = db.me(uid)
	var xp: Array = Rules.data()["xpTable"]
	prof["fishing_xp"] = float(xp[0])
	prof["doubloons"] = 1000000.0
	prof["casino_chips"] = 0.0
	prof["casino_session_buy_ins"] = 0.0
	(db.save["casino"] as Dictionary)["buyIns"] = []
	# The cap by level.
	check(Casino.state(db, uid)["dailyCap"] == 1000.0, "the cap at Fishing 1 is 1,000 (%s)" % str(Casino.state(db, uid)["dailyCap"]))
	check(not RulesApi.run(db, uid, "buyInCasino", [1000.0]).has("error"), "1,000 buys in")
	check(RulesApi.run(db, uid, "buyInCasino", [10.0]).has("error"), "past the cap is refused")
	for pair: Array in [[10, 2000.0], [40, 5000.0], [70, 7500.0], [100, 10000.0]]:
		prof["fishing_xp"] = float(xp[int(pair[0]) - 1])
		check(Casino.state(db, uid)["dailyCap"] == pair[1], "the cap at Fishing %d is %d" % [pair[0], int(pair[1])])
	# The games by level.
	prof["fishing_xp"] = float(xp[8])
	prof["casino_chips"] = 100000.0
	var rr: Dictionary = RulesApi.run(db, uid, "placeBetsAndSpin", [[{ "type": "color", "target": "red", "amount": 10.0 }]])
	check(str(rr.get("error", "")) == "Needs Fishing 10", "roulette waits for Fishing 10 (%s)" % str(rr.get("error", "")))
	check(str(RulesApi.run(db, uid, "dealBlackjack", [10.0]).get("error", "")) == "Needs Fishing 10" or str(RulesApi.run(db, uid, "dealBlackjack", [10.0]).get("error", "")) == "Needs Fishing 20", "blackjack waits")
	prof["fishing_xp"] = float(xp[19])
	check(not RulesApi.run(db, uid, "placeBetsAndSpin", [[{ "type": "color", "target": "red", "amount": 10.0 }]]).has("error"), "roulette opens at 10")
	var bj: Dictionary = RulesApi.run(db, uid, "dealBlackjack", [10.0])
	check(not bj.has("error"), "blackjack opens at 20 (%s)" % str(bj.get("error", "")))
	(db.save["casino"] as Dictionary)["hand"] = null
	# The fixed jackpot.
	var pot0: float = float(Casino.jackpot_state(db)["pot"])
	prof["slots_force_next"] = "catfish"
	prof["casino_chips"] = 1000.0
	var j: Dictionary = RulesApi.run(db, uid, "spinSlots", [100.0])
	check(j.get("outcome") == "jackpot" and float(j.get("payout", 0)) == 30000.0, "three catfish pay 300x (%s)" % str(j.get("payout")))
	check(float(Casino.jackpot_state(db)["pot"]) == pot0, "nothing is fed into or taken from a pot")
	# The long run.
	prof["casino_chips"] = 1.0e12
	var bet: float = 0.0
	var back: float = 0.0
	var jps: int = 0
	for k: int in 200000:
		var s: Dictionary = Casino.spin_slots(db, uid, 100.0)
		bet += 100.0
		back += float(s["payout"])
		if s["outcome"] == "jackpot" or (s.get("bonus") is Dictionary and (s["bonus"] as Dictionary)["outcome"] == "jackpot"):
			jps += 1
	var rtp: float = back / bet * 100.0
	check(rtp > 86.0 and rtp < 94.0, "the machine returns about 90%% (%.2f%% over 200,000 spins)" % rtp)
	print("  den check: %s (return %.2f%%, %d jackpots in 200,000)" % ["ok" if bad == 0 else "%d FAILED" % bad, rtp, jps])
	quit(0 if bad == 0 else 1)
