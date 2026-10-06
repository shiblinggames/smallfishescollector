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
    ("flotilla", "trailer", {"CLIP": "flotilla", "SHOT_T": "0.31", "MOVIE_S": "7", "CINE": "1"}),
    ("charter", "title", {"MOVIE_S": "4.2",
                          "CAPTION": "Sail a world with friends.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    # ── Fishing, and all it opens ──
    ("fish", "trailer", {"CLIP": "fish", "SHOT_T": "0.2", "MOVIE_S": "13",
                         "CAPTION": "Fish the open sea.", "CAPTION_AT": "0.4", "CAPTION_FOR": "2.6",
                         "CAPTION2": "Level up your fishing.", "CAPTION2_AT": "7.6", "CAPTION2_FOR": "3.4"}),
    ("log", "trailer", {"CLIP": "log", "SHOT_T": "0.2", "MOVIE_S": "3.6",
                        "CAPTION": "Fill the log.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("finn", "angler", {"FINN_STEP": "ready", "FINN_TURNIN": "1", "SHOT_T": "0.2", "MOVIE_S": "6.4",
                        "CAPTION": "Take on quests and uncover the story behind the seas.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.6"}),
    ("friends", "trailer", {"CLIP": "people", "SHOT_T": "0.2", "MOVIE_S": "6.4",
                          "CAPTION": "Build rapport and make friends on the waters.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.0"}),
    ("treasure", "trailer", {"CLIP": "treasure", "SHOT_T": "0.2", "MOVIE_S": "3.6",
                             "CAPTION": "Hunt buried treasure.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.6"}),
    ("crate", "trailer", {"CLIP": "crate", "SHOT_T": "0.2", "MOVIE_S": "5.2"}),
    ("wardrobe", "trailer", {"CLIP": "wardrobe", "SHOT_T": "0.2", "MOVIE_S": "8",
                             "CAPTION": "Collect boats, rods, hats and pets.", "CAPTION_AT": "0.3", "CAPTION_FOR": "6.8"}),
    ("badges", "trailer", {"CLIP": "badges", "SHOT_T": "0.2", "MOVIE_S": "4.2",
                           "CAPTION": "Earn every badge.", "CAPTION_AT": "0.4", "CAPTION_FOR": "4.4"}),
    # ── The northern seas and their raids ──
    ("north", "trailer", {"CLIP": "north", "SHOT_T": "0.2", "MOVIE_S": "5.4",
                          "CAPTION": "Explore the northern seas for expeditions.", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.2"}),
    ("campaign", "campaign", {"MOVIE_S": "2.6"}),
    ("ready", "ready", {"READY_MODE": "line", "READY_FLIP": "1", "MOVIE_S": "5.6",
                        "CAPTION": "Take on raids solo or with friends.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.8"}),
    ("coop", "trailer", {"CLIP": "coop", "SHOT_T": "0.3", "MOVIE_S": "8", "QUICK_AIM": "1", "SHIP_SKIN": "galaxy_hull"}),
    ("enemycard", "trailer", {"CLIP": "enemycard", "SHOT_T": "0.3", "MOVIE_S": "4.6",
                              "CAPTION": "Know what you are up against.", "CAPTION_AT": "2.0", "CAPTION_FOR": "2.4", "SHIP_SKIN": "sunken_hand_hull"}),
    ("recruit", "trailer", {"CLIP": "recruits", "SHOT_T": "0.3", "MOVIE_S": "7.6",
                            "CAPTION": "Sign on new hands.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.8"}),
    ("skins", "trailer", {"CLIP": "skinreel", "SHOT_T": "0.2", "MOVIE_S": "6.8",
                          "CAPTION": "Collect the skins for all your crew.", "CAPTION_AT": "0.3", "CAPTION_FOR": "5.6"}),
    ("summon", "trailer", {"CLIP": "summon", "SHOT_T": "0.3", "MOVIE_S": "4.5", "SUM_CLS": "blitz",
                           "CAPTION": "Recruit and train crew to help in battles!", "CAPTION_AT": "0.3", "CAPTION_FOR": "3.6", "SHIP_SKIN": "pitch_black_hull"}),
    ("crewxp", "trailer", {"CLIP": "crewxp", "SHOT_T": "0.3", "MOVIE_S": "6.5", "SHIP_SKIN": "bad_blood_hull", "QUICK_AIM": "1"}),
    ("armory", "trailer", {"CLIP": "armory", "SHOT_T": "0.3", "MOVIE_S": "2.8",
                           "CAPTION": "Arm your ship.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.2"}),
    ("mega", "trailer", {"CLIP": "mega", "MEGA": "railgun", "SHOT_T": "0.3", "MOVIE_S": "4.2", "QUICK_AIM": "1"}),
    # ── The endgame, a highlight reel ──
    ("maelstrom", "trailer", {"CLIP": "maelstrom", "SHOT_T": "0.2", "MOVIE_S": "6",
                              "CAPTION": "Take on endgame content like the gauntlet.", "CAPTION_AT": "0.6", "CAPTION_FOR": "3.8"}),
    ("coopdive", "trailer", {"CLIP": "coopdive", "SHOT_T": "0.2", "MOVIE_S": "14", "SHIP_SKIN": "golden_gauntlet_hull",
                             "CAPTION": "Dive together.", "CAPTION_AT": "0.6", "CAPTION_FOR": "2.6"}),
    ("descent", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "1", "SHOT_F": "1", "MOVIE_S": "4.6",
                         "CAPTION": "Take on endgame content like the gauntlet.", "CAPTION_AT": "0.6", "CAPTION_FOR": "3.4", "SHIP_SKIN": "golden_gauntlet_hull"}),
    ("g_elite", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "elite", "DIVE_DEPTH": "15", "MOVIE_S": "2.6"}),
    ("draft", "dive", {"DIVE_STEP": "party", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "DRAFT_SEQ": "1", "MOVIE_S": "6.4",
                       "CAPTION": "Draft your powers.", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.4", "SHIP_SKIN": "golden_gauntlet_hull"}),
    ("g_spet", "dive", {"DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "spet", "DIVE_DEPTH": "35", "MOVIE_S": "3.2"}),
    ("g_curse", "dive", {"DIVE_STEP": "curse", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.4",
                         "CAPTION": "Bear the Locker's curses,", "CAPTION_AT": "0.3", "CAPTION_FOR": "2.8"}),
    ("g_admiral", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "admiral", "DIVE_DEPTH": "25", "MOVIE_S": "3.2"}),
    ("g_fence", "dive", {"DIVE_STEP": "fence", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "4.4",
                         "CAPTION": "and trade with its fence.", "CAPTION_AT": "2.6", "CAPTION_FOR": "1.7"}),
    ("g_job", "dive", {"DIVE_V": "don", "DIVE_STEP": "contract", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.8",
                       "CAPTION": "Take the Don's jobs, if you dare.", "CAPTION_AT": "1.6", "CAPTION_FOR": "2.0"}),
    ("don", "dive", {"DIVE_V": "don", "DIVE_STEP": "fight", "DIVE_WAIT": "480", "SHOT_F": "1", "ENTRY": "don_finleone", "MOVIE_S": "5.5", "SHIP_SKIN": "dons_ghost_hull"}),
    ("g_breather", "dive", {"DIVE_STEP": "breather", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "MOVIE_S": "3.6",
                            "CAPTION": "Bank it, or dive deeper.", "CAPTION_AT": "1.2", "CAPTION_FOR": "2.2"}),
    ("haul", "dive", {"DIVE_STEP": "haul", "DIVE_WAIT": "480", "SHOT_F": "1", "CLEAR_FOES": "1", "HAUL_LOOT": "1", "MOVIE_S": "6.5",
                      "CAPTION": "Go as far as you can for the best treasure...", "CAPTION_AT": "0.5", "CAPTION_FOR": "5.0"}),
    # ── ...or just fish, and the name ──
    ("calm", "trailer", {"CLIP": "together", "SHOT_T": "0.27", "MOVIE_S": "6",
                         "CAPTION": "...or just go back to fishing.", "CAPTION_AT": "0.8", "CAPTION_FOR": "4.4"}),
    ("end", "trailer", {"CLIP": "night", "SHOT_T": "0.5", "MOVIE_S": "6",
                        "CAPTION": "SEAS THE BOOTY", "CAPTION_STYLE": "end", "SUB": "Wishlist on Steam", "CAPTION_AT": "0.6", "CAPTION_FOR": "9"}),
]
