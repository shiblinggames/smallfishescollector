# THE TRAILER'S SHOT LIST (Kong, 2026-10-05: a ~90s Steam gameplay trailer;
# the game's own soundtrack; a few short cards; Title + Wishlist on Steam).
# Each shot: a name, the tests/shot.gd mode, its env, and how long it runs
# (MOVIE_S) from its MARK. record.py records them; cut.py cuts the film.
# Copy: pirate charm, no em-dashes, nothing the game does not do.

SHOTS = [
    # ── The sea, and the name ──
    ("sail", "trailer", {"CLIP": "sail", "SHOT_T": "0.74", "MOVIE_S": "7",
                         "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "title", "CAPTION_AT": "1.4", "CAPTION_FOR": "3.4"}),
    # ── A crew ──
    ("flotilla", "trailer", {"CLIP": "flotilla", "SHOT_T": "0.12", "MOVIE_S": "6",
                             "CAPTION": "Gather a crew.", "CAPTION_AT": "0.8", "CAPTION_FOR": "3.0"}),
    ("together", "trailer", {"CLIP": "together", "SHOT_T": "0.2", "MOVIE_S": "8.5",
                             "CAPTION": "Fish the open sea together.", "CAPTION_AT": "0.6", "CAPTION_FOR": "3.0"}),
    ("giant", "slain", {"MOVIE_S": "4", "SHOT_T": "0.25"}),
    ("night", "trailer", {"CLIP": "night", "SHOT_T": "0.5", "MOVIE_S": "5"}),
    # ── Fights ──
    ("coop", "trailer", {"CLIP": "coop", "SHOT_T": "0.3", "MOVIE_S": "7.5",
                         "CAPTION": "Fight side by side.", "CAPTION_AT": "0.5", "CAPTION_FOR": "2.6"}),
    ("summon", "trailer", {"CLIP": "summon", "SHOT_T": "0.3", "MOVIE_S": "4.5", "SUM_CLS": "blitz",
                           "CAPTION": "Call on your crew.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.4"}),
    ("mega", "trailer", {"CLIP": "mega", "MEGA": "railgun", "SHOT_T": "0.3", "MOVIE_S": "4.5"}),
    # ── The gauntlets ──
    ("descent", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "1", "SHOT_F": "1", "MOVIE_S": "5",
                         "CAPTION": "Dive as deep as you dare.", "CAPTION_AT": "0.8", "CAPTION_FOR": "2.8"}),
    ("krust", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "krust", "MOVIE_S": "3.6"}),
    ("shrine", "dive", {"DIVE_STEP": "shrine", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.0"}),
    ("leviathan", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "DIVE_DEPTH": "45", "SHOT_MS": "1400", "MOVIE_S": "4.5"}),
    ("kraken", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "DIVE_DEPTH": "15", "SHOT_MS": "1600", "MOVIE_S": "4"}),
    ("crush", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "DIVE_DEPTH": "70", "SHOT_MS": "4500", "MOVIE_S": "3.5"}),
    ("don", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "don_finleone", "MOVIE_S": "5.5"}),
    ("draft", "dive", {"DIVE_STEP": "party", "DIVE_WAIT": "480", "SHOT_F": "30", "CLEAR_FOES": "1", "MOVIE_S": "3"}),
    ("haul", "dive", {"DIVE_STEP": "haul", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.5"}),
    # ── The rooms and the papers ──
    ("ui_log", "log", {"LOG": "captain", "MOVIE_S": "2.4"}),
    ("ui_home", "homestead", {"MOVIE_S": "2.4"}),
    ("ui_tavern", "tavern", {"MOVIE_S": "2.4"}),
    ("ui_crew", "crewhall", {"MOVIE_S": "2.4"}),
    # ── The end card ──
    ("end", "trailer", {"CLIP": "night", "SHOT_T": "0.5", "MOVIE_S": "6",
                        "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "end", "SUB": "Wishlist on Steam", "CAPTION_AT": "0.6", "CAPTION_FOR": "9"}),
]
