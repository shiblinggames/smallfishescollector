class_name Buyer
extends Wanderer
## THE BUYER OUT IN A WATER (Godot port of the residents in
## app/(app)/sea/SeaMap.tsx, docking): one per fishing water, moored in it,
## who takes the whole hold for a little less than the Market pays.
##
## A Wanderer like everyone else out here: they work a beat inside their own
## water (60% of the slack the water leaves them; a regular takes all of it),
## moving from spot to spot and sitting a while, in a look hashed off the
## water's id. The sea asks `near()` to put "Hail <name>" in reach.


func _ready() -> void:
	info = info.duplicate()
	info["driftR"] = Chart.drift_r(Vector2(float(info["x"]), float(info["y"])), info["zoneId"])
	role = "Buyer"
	super._ready()
