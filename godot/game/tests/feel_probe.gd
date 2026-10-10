extends SceneTree
## HOW SMOOTH IT IS (Kong, 2026-10-09: "everything feels like there's a slight
## delay or lag"): the real game in a window, sailing a loop, then opening and
## closing the menus, frame by frame. Per stretch: frame time median, 95th and
## 99th percentile and worst, frames over 20ms, and the CPU (scripts) and GPU
## (render) time per frame. Needs a window (not --headless). Scratch captain.
##
##   godot --path godot/game -s tests/feel_probe.gd

var _vp: RID
var _rows: Array = []


func _init() -> void:
	Captains.dir_override = "user://feel_probe"
	DirAccess.make_dir_recursive_absolute(Captains.dir_override)
	for f: String in DirAccess.get_files_at(Captains.dir_override):
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	_vp = root.get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(_vp, true)
	for f: int in 90:
		await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	await _measure("idle at sea", 2.0, Callable())
	var start: Vector2 = sea._boat.position
	var legs: Array = [Vector2(1400, 0), Vector2(0, 900), Vector2(-1400, 0), Vector2(0, -900)]
	var leg: Array = [0]
	await _measure("sailing", 8.0, func(t: float) -> void:
		var i: int = int(t / 2.0) % 4
		if i != leg[0]:
			leg[0] = i
		sea._boat.target = start + (legs[i] as Vector2))
	sea._boat.target = null
	await _measure("locker open", 1.2, Callable(), func() -> void: sea._open_locker("loadout", ""))
	if sea._locker != null and is_instance_valid(sea._locker):
		sea._locker.queue_free()
		sea._locker = null
	for f: int in 20:
		await process_frame
	await _measure("chart open", 1.2, Callable(), func() -> void: sea._open_chart())
	if sea._chart != null and is_instance_valid(sea._chart):
		sea._chart.queue_free()
		sea._chart = null
	for f: int in 20:
		await process_frame
	await _measure("locker again", 1.2, Callable(), func() -> void: sea._open_locker("loadout", ""))
	if sea._locker != null and is_instance_valid(sea._locker):
		sea._locker.queue_free()
		sea._locker = null
	for f: int in 20:
		await process_frame
	await _measure("chart again", 1.2, Callable(), func() -> void: sea._open_chart())
	if sea._chart != null and is_instance_valid(sea._chart):
		sea._chart.queue_free()
		sea._chart = null
	for f: int in 20:
		await process_frame
	await _measure("esc menu", 1.0, Callable(), func() -> void: sea.menu_wanted.emit())
	print("\nFEEL PROBE  (ms; frames over 20ms; cpu = scripts and draw calls, gpu = render)")
	for r: String in _rows:
		print(r)
	quit()


func _measure(label: String, secs: float, each: Callable, first: Callable = Callable()) -> void:
	var dts: Array = []
	var cpus: Array = []
	var gpus: Array = []
	var procs: Array = []
	var t0: int = Time.get_ticks_usec()
	var last: int = t0
	var first_frame_ms: float = -1.0
	if first.is_valid():
		first.call()
	while Time.get_ticks_usec() - t0 < int(secs * 1e6):
		if each.is_valid():
			each.call(float(Time.get_ticks_usec() - t0) / 1e6)
		await process_frame
		var now: int = Time.get_ticks_usec()
		var dt: float = float(now - last) / 1000.0
		last = now
		if first_frame_ms < 0.0:
			first_frame_ms = float(now - t0) / 1000.0
		dts.append(dt)
		cpus.append(RenderingServer.viewport_get_measured_render_time_cpu(_vp) + RenderingServer.get_frame_setup_time_cpu())
		gpus.append(RenderingServer.viewport_get_measured_render_time_gpu(_vp))
		procs.append(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
	dts.sort()
	var n: int = dts.size()
	var over: int = dts.filter(func(d: float) -> bool: return d > 20.0).size()
	_rows.append("%-12s  frames %4d  med %5.1f  p95 %5.1f  p99 %5.1f  worst %6.1f  >20ms %3d  | scripts %5.1f  cpu %5.1f  gpu %5.1f  | first frame %5.1f" % [
		label, n, dts[n / 2], dts[int(n * 0.95)], dts[mini(n - 1, int(n * 0.99))], dts[n - 1], over,
		_avg(procs), _avg(cpus), _avg(gpus), first_frame_ms])


func _avg(a: Array) -> float:
	var s: float = 0.0
	for v: float in a:
		s += v
	return s / maxf(1.0, a.size())
