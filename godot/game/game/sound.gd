class_name Sound
extends Node
## THE FISHING SOUND, a port of web/lib/fishingMusic.ts (Godot port, fishing
## pass 2).
##
## Effects: the cast (/fishingcast.mp3), the line hitting the water 600ms later
## and an ordinary catch (/fishingcast2.mp3), a perfect (/fishingperfect.mp3,
## loud), and the dial's tick looping while a fish is on (/fishingdial.ogg, a
## little faster for harder fish). Music follows the sea's hour, not the zone:
## day, dusk and dawn, night, crossfaded over three seconds at half volume.
## Silent where the web is silent: the bite, a miss, a crate, a golden, a level.

const MUSIC: Dictionary = { "day": "fishingsoundtrack.ogg", "dusk": "fishingsoundtrackopen.ogg", "dawn": "fishingsoundtrackopen.ogg", "night": "fishingsoundtrackdeep.ogg" }
const MUSIC_DB: float = -6.0
const FADE_S: float = 3.0

static var _me: Sound = null

var _sfx: Array[AudioStreamPlayer] = []
var _dial: AudioStreamPlayer
var _music: Array[AudioStreamPlayer] = []
var _music_on: int = 0
var _track: String = ""


func _ready() -> void:
	_me = self
	for i: int in 6:
		var p: AudioStreamPlayer = AudioStreamPlayer.new()
		add_child(p)
		_sfx.append(p)
	_dial = AudioStreamPlayer.new()
	_dial.volume_db = -4.0
	add_child(_dial)
	for i: int in 2:
		var m: AudioStreamPlayer = AudioStreamPlayer.new()
		m.volume_db = -80.0
		add_child(m)
		_music.append(m)


static func _stream(file: String) -> AudioStream:
	var path: String = "res://art/%s" % file
	return load(path) if ResourceLoader.exists(path) else null


## Play an effect. gain is linear, as the web's (the perfect plays at 1.8).
static func play(file: String, gain: float = 1.0) -> void:
	if _me == null:
		return
	var s: AudioStream = _stream(file)
	if s == null:
		return
	for p: AudioStreamPlayer in _me._sfx:
		if not p.playing:
			p.stream = s
			p.volume_db = linear_to_db(gain)
			p.play()
			return


static func cast() -> void:
	play("fishingcast.mp3")


static func line_in() -> void:
	play("fishingcast2.mp3")


static func perfect() -> void:
	play("fishingperfect.mp3", 1.8)


## The dial's tick while a fish is on; rate 1.0 for the easiest, up to 1.6.
static func dial_start(difficulty: float) -> void:
	if _me == null:
		return
	var s: AudioStream = _stream("fishingdial.ogg")
	if s == null:
		return
	if s is AudioStreamOggVorbis:
		(s as AudioStreamOggVorbis).loop = true
	_me._dial.stream = s
	_me._dial.pitch_scale = 1.0 + (clampf(difficulty, 1.0, 5.0) - 1.0) * 0.15
	_me._dial.play()


static func dial_stop() -> void:
	if _me != null:
		_me._dial.stop()


## Follow the sea's hour. The first call starts the music, fading in.
static func music_for(phase: String) -> void:
	if _me == null:
		return
	var file: String = MUSIC.get(phase, MUSIC["day"])
	if file == _me._track:
		return
	var s: AudioStream = _stream(file)
	if s == null:
		return
	if s is AudioStreamOggVorbis:
		(s as AudioStreamOggVorbis).loop = true
	_me._track = file
	var old: AudioStreamPlayer = _me._music[_me._music_on]
	_me._music_on = 1 - _me._music_on
	var nxt: AudioStreamPlayer = _me._music[_me._music_on]
	nxt.stream = s
	nxt.volume_db = -80.0
	nxt.play()
	var tw: Tween = _me.create_tween().set_parallel(true)
	tw.tween_property(nxt, "volume_db", MUSIC_DB, FADE_S)
	if old.playing:
		tw.tween_property(old, "volume_db", -80.0, FADE_S)
		tw.chain().tween_callback(old.stop)
