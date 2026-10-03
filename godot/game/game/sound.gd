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
## Silent where the web is silent: the bite, a crate, a golden, a level. (A
## miss and a snag have their own sounds since 2026-10-01: see the reel.)

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
	# The music on its own bus, through a low-pass that stays wide open
	# except under the reef's arch (muffle).
	if AudioServer.get_bus_index("Music") == -1:
		AudioServer.add_bus()
		var bi: int = AudioServer.bus_count - 1
		AudioServer.set_bus_name(bi, "Music")
		AudioServer.set_bus_send(bi, "Master")
		var lp: AudioEffectLowPassFilter = AudioEffectLowPassFilter.new()
		lp.cutoff_hz = 20000.0
		AudioServer.add_bus_effect(bi, lp)
	for i: int in 2:
		var m: AudioStreamPlayer = AudioStreamPlayer.new()
		m.bus = "Music"
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


# ── Made, not recorded ─────────────────────────────────────────────────────────
#
# The web builds two sounds out of oscillators rather than files: the harbour
# bell when you tie up (lib/seaAmbience playHarbourBell) and the chest's
# fanfare (lib/fishingMusic playChestSfx). The same partials and envelopes are
# rendered here once into a sample and played like any other effect.

const RATE: int = 22050
static var _made: Dictionary = {}


## voices: [freq_hz, start_s, peak, attack_s, decay_s (to silence), wave]
static func _render(voices: Array, seconds: float) -> AudioStreamWAV:
	var n: int = int(seconds * RATE)
	var buf: PackedFloat32Array = PackedFloat32Array()
	buf.resize(n)
	for v: Array in voices:
		var f: float = v[0]
		var start: float = v[1]
		var peak: float = v[2]
		var attack: float = v[3]
		var decay: float = v[4]
		var tri: bool = v[5] == "triangle"
		var noise: bool = v[5] == "noise"
		var i0: int = int(start * RATE)
		var i1: int = mini(n, int((start + decay + 0.05) * RATE))
		for i: int in range(i0, i1):
			var t: float = float(i - i0) / RATE
			# Linear up to the peak, then exponential down to 0.0001 at decay.
			var env: float = peak * t / attack if t < attack else peak * pow(0.0001 / peak, (t - attack) / maxf(0.001, decay - attack))
			var ph: float = fmod(f * t, 1.0)
			var w: float = randf_range(-1.0, 1.0) if noise else ((4.0 * absf(ph - 0.5) - 1.0) if tri else sin(TAU * ph))
			buf[i] += w * env
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(n * 2)
	for i: int in n:
		bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32000.0))
	var s: AudioStreamWAV = AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.data = bytes
	return s


static func _play_made(key: String, make: Callable, gain: float) -> void:
	if _me == null:
		return
	if not _made.has(key):
		_made[key] = make.call()
	for p: AudioStreamPlayer in _me._sfx:
		if not p.playing:
			p.stream = _made[key]
			p.volume_db = linear_to_db(gain)
			p.play()
			return


# ── The reel (2026-10-01, Kong: "make it feel really good"): every press
# answers. A miss and a snag were silent in the web; now the line speaks.

## XP landing in the bar: a tiny glassy tick.
static func xp_tick() -> void:
	_play_made("xptick", func() -> AudioStreamWAV:
		return _render([[1760.0, 0.0, 0.04, 0.002, 0.06, "sine"], [2637.0, 0.0, 0.015, 0.002, 0.04, "sine"]], 0.1), 0.6)


## A nibble at the bobber: a small, high plip.
static func plip() -> void:
	_play_made("plip", func() -> AudioStreamWAV:
		return _render([[880.0, 0.0, 0.07, 0.003, 0.12, "sine"], [1320.0, 0.004, 0.03, 0.003, 0.07, "sine"]], 0.2), 0.8)


## A miss: the line goes slack, a soft low plip as it drops back.
static func slack() -> void:
	_play_made("slack", func() -> AudioStreamWAV:
		return _render([[310.0, 0.0, 0.16, 0.006, 0.28, "sine"], [205.0, 0.03, 0.1, 0.01, 0.32, "sine"], [620.0, 0.0, 0.04, 0.004, 0.08, "sine"]], 0.45), 1.0)


## A snag: the line parts, a sharp twang and a crack.
static func snap() -> void:
	_play_made("snap", func() -> AudioStreamWAV:
		return _render([[1900.0, 0.0, 0.14, 0.001, 0.03, "triangle"], [176.0, 0.0, 0.2, 0.003, 0.45, "triangle"], [264.0, 0.004, 0.1, 0.003, 0.3, "sine"], [90.0, 0.0, 0.12, 0.004, 0.2, "sine"]], 0.6), 1.0)


## The reel turning as the fish comes in: a run of ratchet clicks, quick then
## slowing as it nears the boat. s is how long the run lasts.
static func reel_clicks(s: float) -> void:
	var key: String = "reel%d" % int(round(s * 10.0))
	_play_made(key, func() -> AudioStreamWAV:
		var v: Array = []
		var t: float = 0.0
		var gap: float = 0.032
		while t < s:
			v.append([2600.0, t, 0.07, 0.001, 0.018, "triangle"])
			v.append([1300.0, t, 0.035, 0.001, 0.025, "sine"])
			t += gap
			gap *= 1.06
		return _render(v, s + 0.1), 0.9)


## THE PERFECT STREAK, heard: each perfect in a row rings a step higher up a
## pentatonic scale (C D E G A, then on up), so a run climbs; at 5 and at 10 it
## resolves into a short flourish. Played on the press, with the perfect.
const STREAK_NOTES: Array = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0]


static func streak(n: int) -> void:
	var i: int = clampi(n - 1, 0, STREAK_NOTES.size() - 1)
	var f: float = STREAK_NOTES[i]
	_play_made("streak%d" % i, func() -> AudioStreamWAV:
		return _render([[f, 0.0, 0.14, 0.004, 0.9, "sine"], [f * 2.0, 0.0, 0.05, 0.004, 0.5, "sine"], [f * 3.01, 0.0, 0.02, 0.004, 0.25, "sine"]], 1.0), 1.0)
	if n == 5 or n == 10:
		var top: bool = n == 10
		_play_made("flourish%s" % top, func() -> AudioStreamWAV:
			var notes: Array = [1046.5, 1318.51, 1567.98, 2093.0, 2637.0] if top else [783.99, 987.77, 1174.66, 1567.98]
			var v: Array = []
			for k: int in notes.size():
				v.append([notes[k], 0.12 + k * 0.07, 0.09, 0.004, 0.7, "sine"])
				v.append([notes[k] * 2.0, 0.12 + k * 0.07, 0.03, 0.004, 0.35, "sine"])
			return _render(v, 1.2), 1.0)


## UNDER THE STONE: 0 is open air, 1 is right under the arch's span, where
## the music closes in to a muffle and dips a little.
static func muffle(k: float) -> void:
	var bi: int = AudioServer.get_bus_index("Music")
	if bi == -1:
		return
	var lp: AudioEffectLowPassFilter = AudioServer.get_bus_effect(bi, 0)
	lp.cutoff_hz = 20000.0 * pow(650.0 / 20000.0, clampf(k, 0.0, 1.0))
	AudioServer.set_bus_volume_db(bi, -3.0 * k)


## A ship's horn, low and long, beating a little (two voices a hair apart):
## the ship under you, crossing north.
static func horn() -> void:
	_play_made("horn", func() -> AudioStreamWAV:
		return _render([[98.0, 0.0, 0.22, 0.28, 2.4, "triangle"], [98.7, 0.0, 0.16, 0.3, 2.3, "triangle"], [196.0, 0.02, 0.07, 0.3, 1.9, "sine"], [294.0, 0.04, 0.035, 0.3, 1.5, "sine"]], 2.6), 1.5)


## A STAMP ON FINN'S SLIP: a dull thump of a stamp on paper; with wax (a
## job handed back), a bright two-note chime over it, its own sound and not
## the level's.
static func seal(wax: bool) -> void:
	_play_made("seal%s" % wax, func() -> AudioStreamWAV:
		var v: Array = [[92.0, 0.0, 0.34, 0.004, 0.22, "triangle"], [184.0, 0.0, 0.12, 0.003, 0.12, "sine"]]
		if wax:
			v.append([1046.5, 0.07, 0.12, 0.006, 0.9, "sine"])
			v.append([1568.0, 0.16, 0.11, 0.006, 1.1, "sine"])
			v.append([3136.0, 0.16, 0.025, 0.004, 0.5, "sine"])
		return _render(v, 1.4), 1.3)


## A catch that counts toward Finn's job: a small pluck, a semitone higher
## for each step nearer done (step 0 to 12), so the last few climb.
static func job_tick(step: int) -> void:
	var k: int = clampi(step, 0, 12)
	_play_made("jobtick%d" % k, func() -> AudioStreamWAV:
		var f: float = 587.33 * pow(2.0, k / 12.0)
		return _render([[f, 0.0, 0.1, 0.003, 0.28, "sine"], [f * 2.0, 0.0, 0.03, 0.003, 0.16, "sine"]], 0.4), 1.0)


## A CANNON (the battle): a deep boom with a crack of powder over it; `big`
## for a volley.
static func cannon(big: bool = false) -> void:
	_play_made("cannon%s" % big, func() -> AudioStreamWAV:
		var v: Array = [[48.0, 0.0, 0.5, 0.004, 0.9, "sine"], [66.0, 0.0, 0.35, 0.004, 0.7, "sine"], [0.0, 0.0, 0.28, 0.002, 0.35, "noise"], [130.0, 0.0, 0.12, 0.003, 0.3, "triangle"]]
		if big:
			v.append([44.0, 0.09, 0.4, 0.004, 0.9, "sine"])
			v.append([0.0, 0.09, 0.22, 0.002, 0.3, "noise"])
			v.append([52.0, 0.18, 0.35, 0.004, 0.9, "sine"])
			v.append([0.0, 0.18, 0.2, 0.002, 0.3, "noise"])
		return _render(v, 1.3), 1.4)


## A ball striking timber: a short crack and a thud.
static func impact(crit: bool = false) -> void:
	_play_made("impact%s" % crit, func() -> AudioStreamWAV:
		var v: Array = [[0.0, 0.0, 0.32, 0.001, 0.18, "noise"], [90.0, 0.0, 0.3, 0.002, 0.35, "triangle"], [180.0, 0.0, 0.1, 0.002, 0.2, "sine"]]
		if crit:
			v.append([0.0, 0.03, 0.25, 0.001, 0.3, "noise"])
			v.append([60.0, 0.0, 0.4, 0.002, 0.6, "sine"])
		return _render(v, 0.8), 1.3)


## The harbour bell: 660Hz with two inharmonic partials, ringing out.
static func bell() -> void:
	_play_made("bell", func() -> AudioStreamWAV:
		return _render([[660.0, 0.0, 0.16, 0.008, 2.6, "sine"], [660.0 * 2.76, 0.0, 0.07, 0.008, 1.6, "sine"], [660.0 * 5.4, 0.0, 0.035, 0.008, 0.9, "sine"]], 2.7), 1.6)


## The chest: a lid thunk, then C5 E5 G5 C6 (and E6 when grand) rising.
static func chest(grand: bool = false) -> void:
	_play_made("chest%s" % grand, func() -> AudioStreamWAV:
		var v: Array = [[160.0, 0.0, 0.3, 0.012, 0.2, "triangle"]]
		var notes: Array = [523.25, 659.25, 783.99, 1046.5, 1318.5] if grand else [523.25, 659.25, 783.99, 1046.5]
		for i: int in notes.size():
			v.append([notes[i], 0.06 + i * 0.075, maxf(0.05, 0.24 - i * 0.018), 0.014, 0.55, "triangle" if i == notes.size() - 1 else "sine"])
		return _render(v, 1.1), 1.4)



## A ball into the sea: a hiss of spray and a low plop.
static func splash() -> void:
	_play_made("splash", func() -> AudioStreamWAV:
		return _render([[0.0, 0.0, 0.2, 0.004, 0.55, "noise"], [190.0, 0.0, 0.16, 0.003, 0.18, "sine"], [120.0, 0.02, 0.1, 0.004, 0.2, "triangle"]], 0.8), 1.0)


## A ball rammed home: a short wooden clunk.
static func clunk() -> void:
	_play_made("clunk", func() -> AudioStreamWAV:
		return _render([[115.0, 0.0, 0.28, 0.002, 0.13, "triangle"], [0.0, 0.0, 0.1, 0.001, 0.05, "noise"], [230.0, 0.0, 0.06, 0.002, 0.07, "sine"]], 0.4), 1.0)


## A hull leaning hard away: rushing water.
static func whoosh() -> void:
	_play_made("whoosh", func() -> AudioStreamWAV:
		return _render([[0.0, 0.0, 0.2, 0.09, 0.35, "noise"], [0.0, 0.12, 0.1, 0.05, 0.3, "noise"]], 0.7), 1.0)


## The railgun gathering: a rising run of tones.
static func charge() -> void:
	_play_made("charge", func() -> AudioStreamWAV:
		var v: Array = []
		var f: Array = [330.0, 415.0, 523.0, 659.0, 830.0, 1046.0]
		for i: int in f.size():
			v.append([f[i], i * 0.065, 0.07 + i * 0.012, 0.01, 0.16, "sine"])
		return _render(v, 0.7), 1.1)
