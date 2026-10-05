# THE TRAILER'S SHOT LIST (Kong, 2026-10-05: a ~90s Steam gameplay trailer;
# the game's own soundtrack; a few short cards; Title + Wishlist on Steam).
# Second pass (Kong's notes): wider on the sea, no Ancient caught (a spoiler),
# the fishing log, a Charter forming with friends joining, getting into a co-op
# raid, chests, re-rolling recruits, ship items, and the gauntlet as its draft
# and its boons rather than band after band.
# Each shot: a name, the tests/shot.gd mode, its env, and how long it runs
# (MOVIE_S) from its MARK. record.py records them; cut.py cuts the film.
# Copy: pirate charm, no em-dashes, nothing the game does not do.

SHOTS = [
    # ── The sea, and the name ──
    ("sail", "trailer", {"CLIP": "sail", "SHOT_T": "0.74", "MOVIE_S": "7",
                         "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "title", "CAPTION_AT": "1.4", "CAPTION_FOR": "3.4"}),
    # ── A crew ──
    ("charter", "title", {"MOVIE_S": "4.2",
                          "CAPTION": "Found a Charter with friends.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    ("flotilla", "trailer", {"CLIP": "flotilla", "SHOT_T": "0.12", "MOVIE_S": "5.5",
                             "CAPTION": "Sail one sea together.", "CAPTION_AT": "0.6", "CAPTION_FOR": "3.0"}),
    ("together", "trailer", {"CLIP": "together", "SHOT_T": "0.2", "MOVIE_S": "7",
                             "CAPTION": "Fish side by side.", "CAPTION_AT": "0.6", "CAPTION_FOR": "2.8"}),
    ("log", "trailer", {"CLIP": "log", "SHOT_T": "0.2", "MOVIE_S": "4",
                        "CAPTION": "Fill the log.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.8"}),
    ("crate", "trailer", {"CLIP": "crate", "SHOT_T": "0.2", "MOVIE_S": "4"}),
    # ── Raids ──
    ("ready", "ready", {"READY_MODE": "line", "READY_FLIP": "1", "MOVIE_S": "3.4",
                        "CAPTION": "Muster the crew.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("coop", "trailer", {"CLIP": "coop", "SHOT_T": "0.3", "MOVIE_S": "7.5",
                         "CAPTION": "Fight side by side.", "CAPTION_AT": "0.5", "CAPTION_FOR": "2.6"}),
    ("summon", "trailer", {"CLIP": "summon", "SHOT_T": "0.3", "MOVIE_S": "4.5", "SUM_CLS": "blitz",
                           "CAPTION": "Call on your crew.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.4"}),
    ("recruit", "trailer", {"CLIP": "recruit", "SHOT_T": "0.3", "MOVIE_S": "7",
                            "CAPTION": "Sign on new hands.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("armory", "trailer", {"CLIP": "armory", "SHOT_T": "0.3", "MOVIE_S": "2.8",
                           "CAPTION": "Arm your ship.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.2"}),
    ("forge", "trailer", {"CLIP": "forge", "SHOT_T": "0.3", "MOVIE_S": "4"}),
    ("mega", "trailer", {"CLIP": "mega", "MEGA": "railgun", "SHOT_T": "0.3", "MOVIE_S": "4.5"}),
    # ── The gauntlets ──
    ("descent", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "1", "SHOT_F": "1", "MOVIE_S": "5",
                         "CAPTION": "Dive as deep as you dare.", "CAPTION_AT": "0.8", "CAPTION_FOR": "2.8"}),
    ("draft", "dive", {"DIVE_STEP": "party", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "DRAFT_SEQ": "1", "MOVIE_S": "5.5",
                       "CAPTION": "Draft your powers.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.4"}),
    ("boons", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "BOON_FX": "1", "DIVE_DEPTH": "25", "SHOT_MS": "3000", "MOVIE_S": "5"}),
    ("krust", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "krust", "MOVIE_S": "3.6"}),
    ("kraken", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "DIVE_DEPTH": "15", "SHOT_MS": "1600", "MOVIE_S": "4"}),
    ("don", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "don_finleone", "MOVIE_S": "5.5"}),
    ("haul", "dive", {"DIVE_STEP": "haul", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.5"}),
    # ── The papers ──
    ("ui_log", "log", {"LOG": "captain", "MOVIE_S": "2.4"}),
    ("ui_home", "homestead", {"MOVIE_S": "2.4"}),
    # ── The end card ──
    ("end", "trailer", {"CLIP": "night", "SHOT_T": "0.5", "MOVIE_S": "6",
                        "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "end", "SUB": "Wishlist on Steam", "CAPTION_AT": "0.6", "CAPTION_FOR": "9"}),
]
