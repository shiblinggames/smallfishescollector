# THE TRAILER'S SHOT LIST (Kong, 2026-10-05: a Steam gameplay trailer; the
# game's own soundtrack; short lines; Wishlist on Steam at the end).
# Passes one to four of Kong's notes: a cold open; no Ancient caught (a
# spoiler); the whole catch; the log; the collectables as reels (every rod,
# boats, hats, colours, pets; crew skins); quests before rapport; treasure;
# the northern seas and the raids; recruits re-rolled to a Legendary, then
# calling on them in a fight; the gauntlet as endgame, its powers stacked and
# firing; and "...or just go back to fishing." before the name.
# Each shot: a name, the tests/shot.gd mode, its env, and how long it runs
# (MOVIE_S) from its MARK. record.py records them; cut.py cuts the film.
# Copy: pirate charm, no em-dashes, nothing the game does not do.

SHOTS = [
    # ── Cold open: a crew under sail ──
    ("flotilla", "trailer", {"CLIP": "flotilla", "SHOT_T": "0.12", "MOVIE_S": "4.5"}),
    ("charter", "title", {"MOVIE_S": "4.2",
                          "CAPTION": "Sail a world with friends.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    # ── Fishing, and all it opens ──
    ("fish", "trailer", {"CLIP": "fish", "SHOT_T": "0.2", "MOVIE_S": "10",
                         "CAPTION": "Fish the open sea.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.6"}),
    ("log", "trailer", {"CLIP": "log", "SHOT_T": "0.2", "MOVIE_S": "3.6",
                        "CAPTION": "Fill the log.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("rod", "level", {"LV_TO": "20", "SHOT_T": "0.2", "MOVIE_S": "3.2",
                      "CAPTION": "Unlock new rods.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.4"}),
    ("finn", "angler", {"FINN_STEP": "ready", "FINN_TURNIN": "1", "SHOT_T": "0.2", "MOVIE_S": "4.6",
                        "CAPTION": "Take on quests and uncover the story behind the seas.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.6"}),
    ("friends", "crest", {"SHOT_T": "0.2", "MOVIE_S": "3.8",
                          "CAPTION": "Build rapport and make friends on the waters.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.0"}),
    ("treasure", "trailer", {"CLIP": "treasure", "SHOT_T": "0.2", "MOVIE_S": "3.6",
                             "CAPTION": "Hunt buried treasure.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("crate", "trailer", {"CLIP": "crate", "SHOT_T": "0.2", "MOVIE_S": "3.6"}),
    ("wardrobe", "trailer", {"CLIP": "wardrobe", "SHOT_T": "0.2", "MOVIE_S": "8",
                             "CAPTION": "Collect boats, rods, hats and pets,", "CAPTION_AT": "0.3", "CAPTION_FOR": "6.8"}),
    ("skins", "trailer", {"CLIP": "skinreel", "SHOT_T": "0.2", "MOVIE_S": "6.8",
                          "CAPTION": "crew skins,", "CAPTION_AT": "0.2", "CAPTION_FOR": "5.8"}),
    ("badges", "achievements", {"SHOT_T": "0.2", "MOVIE_S": "2.4",
                                "CAPTION": "and every badge.", "CAPTION_AT": "0.2", "CAPTION_FOR": "2.0"}),
    # ── The northern seas and their raids ──
    ("north", "trailer", {"CLIP": "north", "SHOT_T": "0.2", "MOVIE_S": "4",
                          "CAPTION": "Explore the northern seas for expeditions.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    ("campaign", "campaign", {"MOVIE_S": "2.6"}),
    ("ready", "ready", {"READY_MODE": "line", "READY_FLIP": "1", "MOVIE_S": "3.4",
                        "CAPTION": "Take on raids solo or with friends.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.8"}),
    ("coop", "trailer", {"CLIP": "coop", "SHOT_T": "0.3", "MOVIE_S": "7"}),
    ("recruit", "trailer", {"CLIP": "recruits", "SHOT_T": "0.3", "MOVIE_S": "7.6",
                            "CAPTION": "Sign on new hands.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.8"}),
    ("summon", "trailer", {"CLIP": "summon", "SHOT_T": "0.3", "MOVIE_S": "4.5", "SUM_CLS": "blitz",
                           "CAPTION": "Recruit and train crew to help in battles!", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    ("armory", "trailer", {"CLIP": "armory", "SHOT_T": "0.3", "MOVIE_S": "2.8",
                           "CAPTION": "Arm your ship.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.2"}),
    ("mega", "trailer", {"CLIP": "mega", "MEGA": "railgun", "SHOT_T": "0.3", "MOVIE_S": "4.2"}),
    # ── The endgame ──
    ("descent", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "1", "SHOT_F": "1", "MOVIE_S": "4.6",
                         "CAPTION": "Take on endgame content like the gauntlet.", "CAPTION_AT": "0.6", "CAPTION_FOR": "3.4"}),
    ("draft", "dive", {"DIVE_STEP": "party", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "DRAFT_SEQ": "1", "MOVIE_S": "5",
                       "CAPTION": "Draft your powers.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.4"}),
    ("stacked", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "400", "SHOT_F": "1", "DIVE_BOONS": "1", "BOON_AUTO": "1", "MOVIE_S": "9",
                         "CAPTION": "Stack them, and watch them fire.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.6"}),
    ("don", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "don_finleone", "MOVIE_S": "5.5"}),
    ("haul", "dive", {"DIVE_STEP": "haul", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.5"}),
    # ── ...or just fish, and the name ──
    ("calm", "trailer", {"CLIP": "together", "SHOT_T": "0.27", "MOVIE_S": "6",
                         "CAPTION": "...or just go back to fishing.", "CAPTION_AT": "0.8", "CAPTION_FOR": "4.4"}),
    ("end", "trailer", {"CLIP": "night", "SHOT_T": "0.5", "MOVIE_S": "6",
                        "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "end", "SUB": "Wishlist on Steam", "CAPTION_AT": "0.6", "CAPTION_FOR": "9"}),
]
