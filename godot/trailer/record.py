# Records the trailer's shots (shots.py) with Godot's movie maker, one clip
# each, native 1920x1080 at 60fps, the game's music muted (the score is laid
# over in cut.py). Run from godot/trailer:  python record.py [names...]
import json, os, re, subprocess, sys, pathlib

GODOT = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.2-stable_win64_console.exe"
HERE = pathlib.Path(__file__).resolve().parent
GAME = HERE.parent / "game"
CLIPS = HERE / "clips"
MARKS = CLIPS / "marks.json"
sys.path.insert(0, str(HERE))
from shots import SHOTS  # noqa: E402

CLIPS.mkdir(exist_ok=True)
marks = json.loads(MARKS.read_text()) if MARKS.exists() else {}
want = set(sys.argv[1:])
override = GAME / "override.cfg"
override.write_text("[display]\n\nwindow/size/window_width_override=1920\nwindow/size/window_height_override=1080\n")
try:
    for name, mode, env in SHOTS:
        if want and name not in want:
            continue
        e = dict(os.environ)
        e.update({"FORCE_WINDOW": "1920x1080", "FILM_NOMUSIC": "1", "CAPTAIN": "Anna"})
        e.update(env)
        out = CLIPS / f"{name}.avi"
        cmd = [GODOT, "--path", str(GAME), "--write-movie", str(out), "--fixed-fps", "60",
               "-s", "tests/shot.gd", "--", str(CLIPS / "x.png"), mode]
        r = subprocess.run(cmd, env=e, capture_output=True, text=True, timeout=900)
        m = re.findall(r"MARK (\d+)", r.stdout)
        n = re.findall(r"END (\d+)", r.stdout)
        if not m:
            print(f"{name}: NO MARK\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
            continue
        start = int(m[-1]) / 60.0
        dur = float(env.get("MOVIE_S", "4"))
        marks[name] = {"start": start, "dur": dur}
        print(f"{name}: start {start:.2f}s, {dur}s" + ("" if n else "  (no END)"))
        MARKS.write_text(json.dumps(marks, indent=1))
finally:
    override.unlink(missing_ok=True)
