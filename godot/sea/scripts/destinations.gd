class_name Destinations
extends RefCounted

## WHERE THINGS ARE, in metres on the XZ plane.
##
## Two kinds of thing, and they are not the same kind.
##
## PORTS are land you sail to and dock at. The Mainland carries the tavern, the
## market and the shops as ONE landmass, because that is what it is — you do not
## sail between the tavern and the shop. Expeditions is its own port, well clear
## of it, because it is its own thing.
##
## WATERS are regions you sail INTO. A fishing zone is not a dot you tap, it is
## a stretch of sea with a boundary: cross into the Deep and the water changes
## under you. That is the difference between a map and a menu with waves on it,
## and it is what lets a level gate be something you can see rather than
## something you are told.
##
## `min_level` mirrors ZONE_MIN_LEVEL in web/app/(app)/fishing/zoneData.ts
## (1 / 15 / 30 / 50 / 75). Duplicated here for standalone editor runs; the app
## passes the real numbers in at load.

const PORTS: Array[Dictionary] = [
	{
		"id": "mainland", "name": "The Mainland", "route": "tavern",
		"pos": Vector3(0, 0, 0), "radius": 46.0, "min_level": 0,
		"tint": Color(0.94, 0.76, 0.42),
	},
	{
		"id": "expeditions", "name": "Expeditions", "route": "expeditions",
		"pos": Vector3(-118, 0, -96), "radius": 30.0, "min_level": 0,
		"tint": Color(0.85, 0.45, 0.40),
	},
]

## `radius` here is the WATER, not a marker: how far the region actually
## reaches. They run outward from the mainland in unlock order, so sailing
## further and fishing deeper end up meaning the same thing.
const WATERS: Array[Dictionary] = [
	{
		"id": "shallows", "name": "The Shallows", "route": "fishing:shallows",
		"pos": Vector3(96, 0, 78), "radius": 62.0, "min_level": 1,
		"tint": Color(0.42, 0.80, 0.82),
	},
	{
		"id": "open_waters", "name": "Open Waters", "route": "fishing:open_waters",
		"pos": Vector3(206, 0, 148), "radius": 70.0, "min_level": 15,
		"tint": Color(0.32, 0.62, 0.86),
	},
	{
		"id": "deep", "name": "The Deep", "route": "fishing:deep",
		"pos": Vector3(322, 0, 92), "radius": 76.0, "min_level": 30,
		"tint": Color(0.24, 0.42, 0.80),
	},
	{
		"id": "abyss", "name": "The Abyss", "route": "fishing:abyss",
		"pos": Vector3(404, 0, 224), "radius": 82.0, "min_level": 50,
		"tint": Color(0.44, 0.32, 0.78),
	},
	{
		"id": "ancient_deep", "name": "The Ancient Deep", "route": "fishing:ancient_deep",
		"pos": Vector3(506, 0, 118), "radius": 88.0, "min_level": 75,
		"tint": Color(0.74, 0.52, 0.24),
	},
]
