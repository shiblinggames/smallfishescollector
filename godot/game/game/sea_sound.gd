class_name SeaSound
extends Node
## THE SEA'S OWN SOUND (Godot over the web baseline, 2026-10-01). The web's
## ambience (lib/seaAmbience.ts) ran only for admins and its recordings were
## never made; here every sound is synthesised once at start and mixed on
## Godot's audio buses, so nothing new has to be recorded.
##
##   HULL   pink noise through a band-pass that opens and climbs with speed
##   SWELL  the same noise, low-passed, breathing slowly
##   WIND   high, thin, stronger the further out
##   RAIN   in a squall
##   SURF   at every island, positional: you hear land before you see it
##   GULLS  near land, now and then, from the shore
##   CREAK  on a hard turn at speed
##   THUNDER after a lightning flash, delayed by the distance
## All of it runs through one ambience bus whose low-pass closes in at night,
## in deep water and while a panel is open, with a little reverb.

const RATE: int = 22050
const AMB: String = "SeaAmb"

var _hull: AudioStreamPlayer
var _swell: AudioStreamPlayer
var _wind: AudioStreamPlayer
var _rain: AudioStreamPlayer
var _gull: AudioStreamPlayer2D
var _creak: AudioStreamPlayer
var _thunder: AudioStreamPlayer
var _surfs: Array[AudioStreamPlayer2D] = []
var _t: float = 0.0
var _gull_t: float = 6.0
var _creak_t: float = 0.0
var _lp: AudioEffectLowPassFilter
var _hull_bp: AudioEffectBandPassFilter
var _wind_bp: AudioEffectBandPassFilter
static var _made: Dictionary = {}


func _ready() -> void:
	_bus(AMB, "Master")
	# Through the player's sea volume (GameSettings).
	GameSettings.apply()
	var amb: int = AudioServer.get_bus_index(AMB)
	if AudioServer.get_bus_effect_count(amb) == 0:
		_lp = AudioEffectLowPassFilter.new()
		_lp.cutoff_hz = 9000.0
		AudioServer.add_bus_effect(amb, _lp)
		var rv: AudioEffectReverb = AudioEffectReverb.new()
		rv.room_size = 0.55
		rv.wet = 0.12
		rv.dry = 1.0
		AudioServer.add_bus_effect(amb, rv)
	else:
		_lp = AudioServer.get_bus_effect(amb, 0)
	_hull_bp = AudioEffectBandPassFilter.new()
	_hull_bp.cutoff_hz = 500.0
	_hull_bp.resonance = 0.7
	_hull = _loop("SeaHull", [_hull_bp], _noise())
	var lo: AudioEffectLowPassFilter = AudioEffectLowPassFilter.new()
	lo.cutoff_hz = 260.0
	_swell = _loop("SeaSwell", [lo], _noise())
	var hp: AudioEffectHighPassFilter = AudioEffectHighPassFilter.new()
	hp.cutoff_hz = 900.0
	_wind_bp = AudioEffectBandPassFilter.new()
	_wind_bp.cutoff_hz = 1600.0
	_wind_bp.resonance = 1.4
	_wind = _loop("SeaWind", [hp, _wind_bp], _noise())
	var rhp: AudioEffectHighPassFilter = AudioEffectHighPassFilter.new()
	rhp.cutoff_hz = 2200.0
	_rain = _loop("SeaRain", [rhp], _noise())
	_gull = AudioStreamPlayer2D.new()
	_gull.bus = AMB
	_gull.stream = _gull_cry()
	_gull.max_distance = 2600.0
	add_child(_gull)
	_creak = AudioStreamPlayer.new()
	_creak.bus = AMB
	_creak.stream = _creak_wav()
	add_child(_creak)
	_thunder = AudioStreamPlayer.new()
	_thunder.bus = AMB
	_thunder.stream = _thunder_wav()
	add_child(_thunder)


## A surf loop standing at each island (a child of the world, so it is heard
## from where the land is).
func add_surf(world: Node2D, at: Vector2, size: float) -> void:
	var p: AudioStreamPlayer2D = AudioStreamPlayer2D.new()
	p.bus = AMB
	p.stream = _surf()
	p.position = at
	p.max_distance = 1400.0 + size * 2.0
	p.attenuation = 1.6
	p.volume_db = -9.0
	p.autoplay = true
	world.add_child(p)
	_surfs.append(p)


static func _bus(name: String, send: String) -> void:
	if AudioServer.get_bus_index(name) >= 0:
		return
	AudioServer.add_bus()
	var i: int = AudioServer.bus_count - 1
	AudioServer.set_bus_name(i, name)
	AudioServer.set_bus_send(i, send)


func _loop(bus: String, fx: Array, stream: AudioStream) -> AudioStreamPlayer:
	_bus(bus, AMB)
	var b: int = AudioServer.get_bus_index(bus)
	while AudioServer.get_bus_effect_count(b) > 0:
		AudioServer.remove_bus_effect(b, 0)
	for e: AudioEffect in fx:
		AudioServer.add_bus_effect(b, e)
	var p: AudioStreamPlayer = AudioStreamPlayer.new()
	p.bus = bus
	p.stream = stream
	p.volume_db = -60.0
	add_child(p)
	p.play(randf() * 3.0)
	return p


# ── The sounds, made once ──────────────────────────────────────────────────────

static func _wav(s: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var data: PackedByteArray = PackedByteArray()
	data.resize(s.size() * 2)
	for i: int in s.size():
		data.encode_s16(i * 2, int(clampf(s[i], -1.0, 1.0) * 32000.0))
	var w: AudioStreamWAV = AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.data = data
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_end = s.size()
	return w


## The web's pink-ish noise (seaAmbience.ts), four seconds, looped.
static func _noise() -> AudioStreamWAV:
	if _made.has("noise"):
		return _made["noise"]
	var n: int = RATE * 4
	var s: PackedFloat32Array = PackedFloat32Array()
	s.resize(n)
	var b0: float = 0.0
	var b1: float = 0.0
	var b2: float = 0.0
	for i: int in n:
		var w: float = randf() * 2.0 - 1.0
		b0 = 0.99765 * b0 + w * 0.099046
		b1 = 0.963 * b1 + w * 0.2965164
		b2 = 0.57 * b2 + w * 1.0526913
		s[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
	# Crossfade the seam so the loop does not click.
	for i: int in 2000:
		var k: float = float(i) / 2000.0
		s[n - 2000 + i] = s[n - 2000 + i] * (1.0 - k) + s[i] * k
	_made["noise"] = _wav(s, true)
	return _made["noise"]


## Surf: low noise in two waves that run up and fall back, nine seconds.
static func _surf() -> AudioStreamWAV:
	if _made.has("surf"):
		return _made["surf"]
	var n: int = RATE * 9
	var s: PackedFloat32Array = PackedFloat32Array()
	s.resize(n)
	var lp: float = 0.0
	var lp2: float = 0.0
	for i: int in n:
		var t: float = float(i) / RATE
		var ph: float = fmod(t, 4.5) / 4.5
		var env: float = (ph / 0.18 if ph < 0.18 else exp(-(ph - 0.18) * 4.2)) * (0.85 if t < 4.5 else 1.0)
		var w: float = randf() * 2.0 - 1.0
		lp += (w - lp) * 0.12
		lp2 += (lp - lp2) * 0.3
		s[i] = (lp2 * 1.6 + w * 0.05 * env) * (0.25 + env)
	for i: int in 3000:
		var k: float = float(i) / 3000.0
		s[n - 3000 + i] = s[n - 3000 + i] * (1.0 - k) + s[i] * k
	_made["surf"] = _wav(s, true)
	return _made["surf"]


## A gull: two falling cries, "kee-ow", with a rough throat.
static func _gull_cry() -> AudioStreamWAV:
	var n: int = int(RATE * 0.9)
	var s: PackedFloat32Array = PackedFloat32Array()
	s.resize(n)
	var ph: float = 0.0
	for i: int in n:
		var t: float = float(i) / RATE
		var call: float = fmod(t, 0.45) / 0.45
		var f: float = lerpf(2100.0, 1150.0, pow(call, 0.6)) * (1.0 + 0.04 * sin(t * 90.0))
		ph += f / RATE * TAU
		var env: float = sin(clampf(call, 0.0, 1.0) * PI) * (1.0 if t < 0.45 else 0.75)
		var v: float = sin(ph) * 0.6 + sin(ph * 2.0) * 0.25 + sin(ph * 3.0) * 0.12 + (randf() - 0.5) * 0.08
		s[i] = v * env * 0.5
	return _wav(s, false)


## A creak of timber: a low rasp sliding in pitch.
static func _creak_wav() -> AudioStreamWAV:
	var n: int = int(RATE * 0.7)
	var s: PackedFloat32Array = PackedFloat32Array()
	s.resize(n)
	var ph: float = 0.0
	for i: int in n:
		var t: float = float(i) / RATE
		var f: float = 95.0 + 40.0 * sin(t * 7.0) + 25.0 * t
		ph += f / RATE
		var saw: float = fmod(ph, 1.0) * 2.0 - 1.0
		var grit: float = (randf() - 0.5) * 0.4 * (0.5 + 0.5 * sin(t * 160.0))
		var env: float = minf(1.0, t / 0.06) * exp(-t * 3.2)
		s[i] = (saw * 0.5 + grit) * env * 0.45
	return _wav(s, false)


## Thunder: a crack, then a long low roll.
static func _thunder_wav() -> AudioStreamWAV:
	var n: int = int(RATE * 4.0)
	var s: PackedFloat32Array = PackedFloat32Array()
	s.resize(n)
	var lp: float = 0.0
	var lp2: float = 0.0
	for i: int in n:
		var t: float = float(i) / RATE
		var w: float = randf() * 2.0 - 1.0
		lp += (w - lp) * 0.05
		lp2 += (lp - lp2) * 0.08
		var roll: float = exp(-t * 0.9) * (0.7 + 0.3 * sin(t * 5.0 + sin(t * 1.3) * 3.0))
		var crack: float = exp(-t * 18.0) * w * 0.6
		s[i] = (lp2 * 5.0 * roll + crack) * 0.8
	return _wav(s, false)


# ── Each frame ─────────────────────────────────────────────────────────────────

static func _db(lin: float) -> float:
	return linear_to_db(maxf(lin, 0.00001))


## speed 0..1 of top, turn 0..1, depth 0..1 (how far out), land 0..1 (how
## close the nearest shore is), rain 0..1, dark 0..1, hush when a panel is up.
func step(delta: float, speed: float, turn: float, depth: float, land: float, rain: float, dark: float, hush: bool, shore_at: Vector2) -> void:
	_t += delta
	var h: float = 0.45 if hush else 1.0
	var k: float = 1.0 - exp(-delta * 2.5)
	_hull.volume_db = lerpf(_hull.volume_db, _db((0.02 + speed * speed * 0.34) * h * (1.0 + 0.28 * sin(_t * TAU * 0.19))), k)
	_hull_bp.cutoff_hz = 380.0 + speed * 700.0
	_swell.volume_db = lerpf(_swell.volume_db, _db((0.05 + depth * 0.16) * h * (0.7 + 0.3 * sin(_t * TAU * 0.085))), k)
	_wind.volume_db = lerpf(_wind.volume_db, _db((0.012 + speed * 0.05 + depth * 0.02 + rain * 0.05) * h), k)
	_wind_bp.cutoff_hz = 1600.0 + 500.0 * sin(_t * TAU * 0.07) + rain * 600.0
	_rain.volume_db = lerpf(_rain.volume_db, _db(rain * 0.30 * h), k)
	_lp.cutoff_hz = lerpf(_lp.cutoff_hz, lerpf(9000.0, 2000.0, maxf(maxf(dark * 0.45, depth * 0.5), 0.55 if hush else 0.0)), k)
	_gull_t -= delta
	if land > 0.35 and not hush and _gull_t <= 0.0:
		_gull_t = randf_range(8.0, 22.0)
		_gull.global_position = shore_at
		_gull.pitch_scale = randf_range(0.92, 1.08)
		_gull.volume_db = _db(0.22 * land) + 6.0
		_gull.play()
	_creak_t -= delta
	if turn > 0.55 and speed > 0.35 and _creak_t <= 0.0:
		_creak_t = 4.0
		_creak.pitch_scale = randf_range(0.9, 1.1)
		_creak.volume_db = _db(0.35 * h)
		_creak.play()


## A strike: the thunder follows after a beat, louder the nearer it was.
func thunder(strength: float) -> void:
	get_tree().create_timer(randf_range(0.5, 1.6)).timeout.connect(func() -> void:
		_thunder.volume_db = _db(0.5 + strength * 0.5)
		_thunder.pitch_scale = randf_range(0.85, 1.1)
		_thunder.play())


func _exit_tree() -> void:
	_made.clear()
