class_name Prefs
extends RefCounted
## THIS MACHINE'S SMALL PREFERENCES (Godot port, docking): what the web keeps
## in localStorage, such as the Market's Advanced switch and its ticker's
## colour mode. Conveniences only; nothing a captain owns lives here.

const PATH: String = "user://prefs.cfg"
static var _cfg: ConfigFile = null


static func _load() -> ConfigFile:
	if _cfg == null:
		_cfg = ConfigFile.new()
		_cfg.load(PATH)
	return _cfg


static func get_value(key: String, fallback: Variant) -> Variant:
	return _load().get_value("prefs", key, fallback)


static func set_value(key: String, value: Variant) -> void:
	_load().set_value("prefs", key, value)
	_cfg.save(PATH)
