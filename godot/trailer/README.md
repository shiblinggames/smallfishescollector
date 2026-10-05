# The gameplay trailer

A ~80 to 90 second Steam trailer, recorded from the real game and cut by script,
so it can be shot again whenever the game changes.

- `shots.py`: the shot list. Each shot is a `tests/shot.gd` mode and its settings,
  plus how long it runs. The on-screen lines (`CAPTION`) live here too.
- `record.py`: records every shot (or the ones named) with Godot's movie maker at
  1920x1080, 60fps, with the game's music muted. Each clip lands in `clips/` and its
  start goes in `clips/marks.json`.
- `cut.py`: cuts `trailer.mp4` from the clips. It adds crossfades between shots and
  dips to black between sections. The game's own sound sits under the score, which
  is the game's own soundtrack: the main theme for the sea, the deep track for the
  fights, then the main theme's opening for the end card. Loudness is normalised for
  Steam and YouTube. It also writes `trailer-poster.jpg`.
- `peek.py`: a contact sheet of clips (`clips/peek.png`), for checking a shot.

To run, from this folder (Godot and ffmpeg as installed on Kong's machine):

    python record.py            # all shots, about 15 minutes
    python record.py coop mega  # just these
    python cut.py               # about a minute

The trailer-only shots (sailing, the crew together, the co-op round, a crew summon,
the Mega) are in `game/tests/trailer_shots.gd`. Everything else reuses the screenshot
rig's own staging.

`clips/` and the outputs are not committed (they are large).
