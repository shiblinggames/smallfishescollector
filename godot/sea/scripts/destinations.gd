class_name Destinations
extends RefCounted

## WHERE THINGS ARE.
##
## The whole map in one table, so moving a place is editing a number rather than
## dragging a node and hoping the scene file is right.
##
## DISTANCE IS PROGRESSION. The fishing zones run outward from home in the order
## they unlock: the Shallows are a short hop, the Ancient Deep is right out on
## the edge. Nothing enforces that, it just makes the map say what the level
## gates say. Sailing further and fishing deeper end up meaning the same thing.
##
## `min_level` mirrors ZONE_MIN_LEVEL in web/app/(app)/fishing/zoneData.ts
## (1 / 15 / 30 / 50 / 75). It is duplicated here on purpose for now: phase 3
## feeds the real numbers in from the app at load, and these become the fallback
## for running the project standalone in the editor.
##
## Only PLACES belong here. Badges, leaderboards, social and profile are menus,
## and putting a menu on a map only makes it slower to reach.

## `route` is what gets posted to the web app on docking. SeaFrame.tsx maps it.
const LIST: Array[Dictionary] = [
	{
		"id": "tavern", "name": "The Tavern", "route": "tavern",
		"pos": Vector2(0, 0), "min_level": 0,
		"tint": Color(0.94, 0.72, 0.36),
	},
	{
		"id": "market", "name": "The Market", "route": "market",
		"pos": Vector2(620, -380), "min_level": 0,
		"tint": Color(0.62, 0.82, 0.55),
	},
	{
		"id": "expeditions", "name": "Expeditions", "route": "expeditions",
		"pos": Vector2(-780, -520), "min_level": 0,
		"tint": Color(0.85, 0.45, 0.40),
	},
	{
		"id": "shallows", "name": "The Shallows", "route": "fishing:shallows",
		"pos": Vector2(760, 620), "min_level": 1,
		"tint": Color(0.56, 0.86, 0.88),
	},
	{
		"id": "open_waters", "name": "Open Waters", "route": "fishing:open_waters",
		"pos": Vector2(1650, 1150), "min_level": 15,
		"tint": Color(0.44, 0.74, 0.90),
	},
	{
		"id": "deep", "name": "The Deep", "route": "fishing:deep",
		"pos": Vector2(2500, 700), "min_level": 30,
		"tint": Color(0.36, 0.56, 0.88),
	},
	{
		"id": "abyss", "name": "The Abyss", "route": "fishing:abyss",
		"pos": Vector2(3150, 1750), "min_level": 50,
		"tint": Color(0.52, 0.42, 0.86),
	},
	{
		"id": "ancient_deep", "name": "The Ancient Deep", "route": "fishing:ancient_deep",
		"pos": Vector2(3900, 900), "min_level": 75,
		"tint": Color(0.80, 0.60, 0.30),
	},
]
