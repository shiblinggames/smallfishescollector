class_name SteamLayer
extends RefCounted
## STEAM, WHEN IT IS THERE (Godot port, the Charter slice; the desktop shell's
## electron/steam.cjs carried over).
##
## The App ID comes from STB_STEAM_APPID (480 is Valve's public test app,
## Spacewar, for a quick check) or the project setting steam/app_id, 0 until
## the store page exists. With no App ID, or Steam not running, everything here
## does nothing and the game plays the same: a Charter then sails over the
## local network instead (CrewNet), which is how two copies are tested on one
## machine.

static var up: bool = false
static var why: String = "not started"
static var app_id: int = 0


static func start() -> void:
	var env: String = OS.get_environment("STB_STEAM_APPID")
	app_id = int(env) if env.is_valid_int() else int(ProjectSettings.get_setting("steam/app_id", 0))
	if app_id <= 0:
		why = "no Steam App ID configured"
		return
	if not ClassDB.class_exists("Steam"):
		why = "GodotSteam is not loaded"
		return
	var steam: Object = Engine.get_singleton("Steam")
	var r: Dictionary = steam.call("steamInitEx", app_id, true)
	if int(r.get("status", 1)) != 0:
		why = "Steam did not start: %s" % r.get("verbal", "")
		return
	up = true
	why = ""


static func steam() -> Object:
	return Engine.get_singleton("Steam") if up else null


## Who is playing: their Steam ID, or on the local network a key this machine
## keeps (a second copy on the same machine passes --as=<name> to be someone
## else).
static func player_key() -> String:
	if up:
		return str(steam().call("getSteamID"))
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--as="):
			return "local-" + a.trim_prefix("--as=")
	var k: String = Prefs.get_value("local_player_key", "")
	if k == "":
		k = "local-" + Crypto.new().generate_random_bytes(5).hex_encode()
		Prefs.set_value("local_player_key", k)
	return k


## The name a new captain is offered: the Steam name, cut to what a username
## allows (letters, digits and underscores, 3 to 20), or nothing.
static func suggested_name() -> String:
	if not up:
		for a: String in OS.get_cmdline_user_args():
			if a.begins_with("--as="):
				return a.trim_prefix("--as=")
		return ""
	var raw: String = str(steam().call("getPersonaName"))
	var out: String = ""
	for ch: String in raw:
		if (ch >= "a" and ch <= "z") or (ch >= "A" and ch <= "Z") or (ch >= "0" and ch <= "9") or ch == "_":
			out += ch
	return out.left(20) if out.length() >= 3 else ""
