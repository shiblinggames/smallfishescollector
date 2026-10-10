class_name SaveFile
extends RefCounted
## THE CAPTAIN'S SAVE FILE, a port of web/lib/data/local/saveFile.ts (Godot
## port, stage 0).
##
## One captain's game as one JSON document, in the SAME format as the web's
## local save (format "seasthebooty-local-save", version 13), so a save moves
## between the TypeScript build and this one and the two can be compared
## directly. The save is kept as the plain dictionary the JSON is: the rules
## are ported to read and write it in the same shape the TS does.
##
## The fish species are game content (content/fish_species.json), re-attached
## on load and never written, so a content update reaches an old save.
##
## Only v13 opens: the web is a beta and nothing carries to Steam (Kong,
## 2026-09-30), so the older formats' upgrades were not ported. A later format
## adds its upgrade here, as the TS does in MIGRATIONS.

const FORMAT: String = "seasthebooty-local-save"
const VERSION: int = 13


## { save, carried, saved_at } on success, { error } otherwise.
static func deserialize(text: String, species: Array) -> Dictionary:
	var parsed: Variant = JsJson.parse(text)
	if typeof(parsed) != TYPE_DICTIONARY or (parsed as Dictionary).get("format") != FORMAT:
		return { "error": "not a Seas the Booty save" }
	var file: Dictionary = parsed
	var version: int = int(file.get("version", 0))
	if version > VERSION:
		return { "error": "this save is from a newer version of the game (v%d)" % version }
	if version < VERSION:
		return { "error": "no upgrade from save v%d" % version }
	var save: Dictionary = file["save"]
	save["species"] = species
	return { "save": save, "carried": file.get("carried", {}), "saved_at": str(file.get("savedAt", "")) }


static func serialize(save: Dictionary, carried: Dictionary = {}, saved_at: String = "") -> String:
	var state: Dictionary = save.duplicate(false)
	state.erase("species")
	if saved_at == "":
		saved_at = Time.get_datetime_string_from_system(true) + "Z"
	return JsJson.stringify({ "format": FORMAT, "version": VERSION, "savedAt": saved_at, "save": state, "carried": carried })


## Write atomically: the whole text to a temp file, then renamed over the save,
## so a crash mid-write leaves the old save whole. A write that fails part way
## (a full disk, a locked file) is thrown away and never renamed over the save.
static func write_file(file_path: String, text: String) -> Error:
	var tmp: String = file_path + ".tmp"
	var f: FileAccess = FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	var stored: bool = f.store_string(text)
	f.flush()
	var err: Error = f.get_error()
	f.close()
	if not stored or err != OK:
		DirAccess.remove_absolute(tmp)
		return err if err != OK else ERR_FILE_CANT_WRITE
	return DirAccess.rename_absolute(tmp, file_path)
