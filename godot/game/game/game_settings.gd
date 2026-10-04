class_name GameSettings
extends RefCounted
## THIS MACHINE'S SETTINGS (Godot port, 2026-10-04; Kong: "we'll need to build
## out a much more robust settings page"): sound, display and play, kept in
## Prefs (user://prefs.cfg) and applied at start and on every change. The page
## is game/settings_sheet.gd.
##
## SOUND runs on its own buses: the effects on "SFX"; the music bus (Sound's
## "Music", which muffles itself under the arch) and the sea's ambience
## (SeaSound's "SeaAmb", filtered by weather) each send through a bus of the
## player's own ("UserMusic", "UserAmb"), so a volume set here never fights
## the game's own fades.

const DEFAULTS: Dictionary = {
	"vol_master": 0.9, "vol_music": 0.75, "vol_sfx": 0.9, "vol_amb": 0.8, "quiet_unfocused": true,
	"window_mode": "windowed", "window_size": "1600x900", "vsync": true, "fps_cap": 0, "show_fps": false,
	"rumble": true, "reduce_flash": false,
}
const SIZES: Array = ["1280x720", "1600x900", "1920x1080", "2560x1440"]
const CAPS: Array = [0, 30, 60, 120, 144, 240]


static func value(key: String) -> Variant:
	return Prefs.get_value("set_" + key, DEFAULTS.get(key))


static func set_value(key: String, v: Variant) -> void:
	Prefs.set_value("set_" + key, v)
	apply()


static func _bus(name: String, send: String) -> int:
	var bi: int = AudioServer.get_bus_index(name)
	if bi == -1:
		AudioServer.add_bus()
		bi = AudioServer.bus_count - 1
		AudioServer.set_bus_name(bi, name)
	AudioServer.set_bus_send(bi, send)
	return bi


## The player's buses, and the game's own routed through them (call again once
## a game bus exists).
static func ensure_buses() -> void:
	_bus("SFX", "Master")
	_bus("UserMusic", "Master")
	_bus("UserAmb", "Master")
	if AudioServer.get_bus_index("Music") != -1:
		AudioServer.set_bus_send(AudioServer.get_bus_index("Music"), "UserMusic")
	if AudioServer.get_bus_index("SeaAmb") != -1:
		AudioServer.set_bus_send(AudioServer.get_bus_index("SeaAmb"), "UserAmb")


static func _vol(bus: String, lin: float) -> void:
	var bi: int = AudioServer.get_bus_index(bus)
	if bi == -1:
		return
	AudioServer.set_bus_mute(bi, lin <= 0.001)
	AudioServer.set_bus_volume_db(bi, linear_to_db(maxf(0.001, lin)))


static func apply() -> void:
	ensure_buses()
	_vol("Master", float(value("vol_master")))
	_vol("UserMusic", float(value("vol_music")))
	_vol("SFX", float(value("vol_sfx")))
	_vol("UserAmb", float(value("vol_amb")))
	if DisplayServer.get_name() == "headless":
		return
	match str(value("window_mode")):
		"fullscreen":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		"borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		_:
			if DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_WINDOWED:
				DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			var parts: PackedStringArray = str(value("window_size")).split("x")
			if parts.size() == 2:
				var want: Vector2i = Vector2i(int(parts[0]), int(parts[1]))
				var screen: Vector2i = DisplayServer.screen_get_size()
				want = Vector2i(mini(want.x, screen.x), mini(want.y, screen.y))
				if DisplayServer.window_get_size() != want:
					DisplayServer.window_set_size(want)
					DisplayServer.window_set_position(DisplayServer.screen_get_position() + (screen - want) / 2)
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if bool(value("vsync")) else DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = int(value("fps_cap"))


## Whether flashes are toned down (Reduce flashes).
static func calm() -> bool:
	return bool(value("reduce_flash"))


## The build this is (tools/build.mjs writes it; "development" otherwise).
static func build() -> String:
	return str(ProjectSettings.get_setting("application/config/build", "development"))
