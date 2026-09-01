# -*- coding: utf-8 -*-
"""
RUNGS 4 AND 5 AGAIN, THIS TIME FITTING IN THE FRAME.

Both were chopped: the Great hall lost its brazier rock and woodpile off the
right edge, and the Estate lost the right side of its lighthouse and the whole
bottom-right corner of its jetty. My own rung-4 prompt asked for "a slipway of
worn planks running out of the frame", so the model did exactly that and rung 5
inherited it, plus a lighthouse pushed hard against the right edge.

Rungs 1 to 3 are fine and are NOT touched. Rung 4 chains from the live rung-3
png instead, which is transparent rather than magenta, so the prompt says so.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from chain import generate, STYLE, AVOID, OUT   # noqa: E402

RUNG_3 = "https://www.seasthebooty.com/sea/home-isle-3.png"

# ── THE FIX ─────────────────────────────────────────────────────────────────
# Stated first, in its own paragraph, and repeated in the avoid list. Framing
# instructions buried at the end of a long style block get outvoted by whatever
# the composition wants to do.
FRAME = (
    "FRAMING, AND THIS IS THE MOST IMPORTANT INSTRUCTION: the ENTIRE scene must fit "
    "COMPLETELY INSIDE the image. Every building, every rock, every tree, every plank and the "
    "whole patch of ground must be fully visible, with a clear even margin of empty magenta "
    "background on ALL FOUR SIDES - top, bottom, left and right. NOTHING touches any edge of the "
    "image and NOTHING is cut off by it. Zoom the camera out far enough that everything fits with "
    "room to spare. Do not crop the lighthouse, do not crop the jetty, do not crop the ground.\n\n"
)

KEEP_3 = (
    "The reference image is the same small island, drawn on a transparent background. KEEP "
    "EVERYTHING IN IT EXACTLY AS IT IS: the same viewpoint, the same angle, the same ground and "
    "rocks in the same places, the same light and shadow direction, the same painting style. The "
    "longhouse, the walled garden, the trees, the drying rack, the woodpile, the fire ring and the "
    "path must all stay exactly where they are. Render your version on a FLAT SOLID PURE MAGENTA "
    "background, hex FF00FF.\n\nCHANGE ONLY THIS: "
)

KEEP_4 = (
    "This is the same small island. KEEP EVERYTHING EXACTLY AS IT IS: the same viewpoint, the same "
    "angle, the same ground and rocks in the same places, the same light and shadow direction, the "
    "same painting style, the same flat magenta background. The great hall, the walled garden, the "
    "trees, the drying rack, the woodpile, the boathouse and the path must all stay exactly where "
    "they are.\n\nCHANGE ONLY THIS: "
)

BODY_4 = (
    "raise the longhouse into a two-storey GREAT HALL on the same footprint: a second floor with "
    "dormer windows, a steeper slate roof, a bigger stone chimney and a carved timber porch over "
    "the door. Then ADD: on the higher rocky ground behind the hall, a stone BRAZIER on a short "
    "plinth with a small fire burning in it, drawn COMPLETE and fully inside the frame with "
    "magenta visible beyond it; and at the near edge of the ground, a small timber BOATHOUSE with "
    "an open end and a short slipway of worn planks that runs a little way down the ground and "
    "STOPS, entirely inside the image, with magenta visible below and beyond its end."
)

BODY_5 = (
    "finish the great hall into an ESTATE: add a square stone tower with a shallow pitched roof "
    "onto one end of the hall, dress the walls in cut pale stone, and add a low stone terrace with "
    "steps down to the path. Then REPLACE the brazier on the high ground behind it with a tall "
    "white-and-slate LIGHTHOUSE: a tapering round tower with a black gallery rail and a glazed "
    "lantern room lit warm gold at the top, a small keeper's store at its foot, and a short flight "
    "of steps up to it. The lighthouse must be drawn COMPLETE from its base to the weathervane on "
    "its cap, standing well inside the image with a clear band of magenta above it and to its "
    "right. The boathouse and its slipway stay exactly as they are and stay fully inside the frame."
)

print("=== home-isle-4")
url4 = generate(FRAME + KEEP_3 + BODY_4 + "\n\n" + STYLE + "\n\nAvoid: " + AVOID
                + ", cropped, cut off at the edge, touching the frame edge, bleeding off the image, "
                  "running out of frame, partially visible building, tight crop",
                str(OUT / "home-isle-4.png"), refs=[RUNG_3])
if not url4:
    sys.exit("rung 4 failed")

print("=== home-isle-5")
url5 = generate(FRAME + KEEP_4 + BODY_5 + "\n\n" + STYLE + "\n\nAvoid: " + AVOID
                + ", cropped, cut off at the edge, touching the frame edge, bleeding off the image, "
                  "running out of frame, partially visible building, tight crop",
                str(OUT / "home-isle-5.png"), refs=[url4])
print("done")
