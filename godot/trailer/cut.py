# Cuts the trailer from the recorded clips (record.py, clips/marks.json):
# each shot trimmed from its MARK, short crossfades between shots and longer
# dips through black between sections, the game's own SFX under the score,
# the score the game's own tracks: the main theme under the sea and the crew,
# the deep track under the fights and the gauntlets, the main theme's quiet
# opening again under the end card. Loudness to -14 LUFS (Steam, YouTube).
# Out: trailer.mp4 (1920x1080, 60fps, H.264 + AAC) and trailer-poster.jpg.
import json, subprocess, pathlib

FF = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
HERE = pathlib.Path(__file__).resolve().parent
CLIPS = HERE / "clips"
ART = HERE.parent / "game" / "art"
marks = json.loads((CLIPS / "marks.json").read_text())

# (shot, seconds used, the transition INTO the next: "x" crossfade, "b" via black)
# (shot, seconds in from its MARK, seconds used, the way into the next: "x"
# a dissolve, "b" a dip through black). Kong: no cutting away mid-popup; let
# each moment land and settle before it dissolves.
EDIT = [
    ("flotilla", 0.0, 4.4, "x"),
    ("charter", 0.0, 4.2, "x"),
    ("fish", 0.0, 11.4, "x"),
    ("finn", 0.0, 6.0, "x"),
    ("friends", 0.0, 6.0, "x"),
    ("wardrobe", 0.0, 7.8, "x"),
    ("badges", 0.0, 5.6, "b"),
    ("north", 0.0, 5.0, "x"),
    ("ready", 0.0, 5.2, "x"),
    ("coop", 0.8, 9.6, "x"),
    ("recruit", 0.6, 6.8, "x"),
    ("skins", 0.0, 6.4, "x"),
    ("summon", 0.0, 4.4, "x"),
    ("crewxp", 1.4, 5.0, "x"),
    ("mega", 0.2, 4.0, "b"),
    ("descent", 0.0, 4.6, "x"),
    ("draft", 0.0, 4.4, "x"),
    ("don", 0.0, 4.4, "x"),
    ("g_shrine", 0.0, 5.8, "x"),
    ("g_records", 0.0, 5.2, "b"),
    ("calm", 0.0, 5.8, "b"),
    ("end", 0.0, 6.3, ""),
]
XF = 0.8      # a dissolve between shots
BK = 1.0      # a dip through black between sections
SFX_DB = -7.0 # the game's own sound, under the score

edit = [e for e in EDIT if e[0] in marks]
missing = [e[0] for e in EDIT if e[0] not in marks]
OFF = {e[0]: e[1] for e in edit}
edit = [(e[0], e[2], e[3]) for e in edit]
if missing:
    print("missing shots (left out):", missing)

inputs = []
parts = []
for i, (name, dur, _t) in enumerate(edit):
    m = marks[name]
    d = min(dur, m["dur"])
    inputs += ["-i", str(CLIPS / f"{name}.avi")]
    st0 = m["start"] + OFF.get(name, 0.0)
    d = min(d, m["dur"] - OFF.get(name, 0.0))
    parts.append(f"[{i}:v]trim=start={st0:.4f}:duration={d:.4f},setpts=PTS-STARTPTS,fps=60,scale=1920:1080:flags=lanczos,format=yuv420p,settb=AVTB[v{i}];"
                 f"[{i}:a]atrim=start={st0:.4f}:duration={d:.4f},asetpts=PTS-STARTPTS,aresample=48000[a{i}];")
    edit[i] = (name, d, _t)

# Chain the transitions: offsets are where each fade starts on the joined line.
fc = "".join(parts)
cur_v, cur_a = "v0", "a0"
length = edit[0][1]
for i in range(1, len(edit)):
    kind = edit[i - 1][2]
    fd = BK if kind == "b" else XF
    trans = "fadeblack" if kind == "b" else "fade"
    off = length - fd
    fc += f"[{cur_v}][v{i}]xfade=transition={trans}:duration={fd}:offset={off:.4f}[vx{i}];"
    fc += f"[{cur_a}][a{i}]acrossfade=d={fd}[ax{i}];"
    cur_v, cur_a = f"vx{i}", f"ax{i}"
    length = off + edit[i][1]

# Where the sections fall on the joined line (for the score).
starts = []
t = 0.0
for i, (name, d, kind) in enumerate(edit):
    starts.append(t)
    fd = BK if kind == "b" else XF
    t += d - fd
fight_at = starts[[e[0] for e in edit].index("north")] if "north" in [e[0] for e in edit] else length * 0.35
end_at = starts[-1]
total = length

# The score: the main theme, start to finish (Kong: one track, no switching).
inputs += ["-i", str(ART / "fishingsoundtrack.ogg")]
n = len(edit)
m_in = max(0.0, min(3.0, 122.6 - total))   # the theme is 122.8s: never run off its end
fc += (f"[{n}:a]atrim=start={m_in:.2f}:duration={total:.3f},asetpts=PTS-STARTPTS,aresample=48000,"
       f"afade=t=in:d=1.2,afade=t=out:st={total - 3.0:.3f}:d=3.0[score];"
       f"[{cur_a}]volume={SFX_DB}dB[sfx];"
       f"[score][sfx]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout];"
       f"[{cur_v}]fade=t=in:d=0.8,fade=t=out:st={total - 1.2:.3f}:d=1.2[vout]")

out = HERE / "trailer.mp4"
cmd = [FF, "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "60",
       "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-movflags", "+faststart", str(out)]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-3000:])
    raise SystemExit(1)
# The poster: a real frame (the crew under sail, the caption up).
fl = starts[[e[0] for e in edit].index("wardrobe")] + 2.6 if "wardrobe" in [e[0] for e in edit] else 5.0
subprocess.run([FF, "-y", "-v", "error", "-ss", f"{fl:.2f}", "-i", str(out), "-frames:v", "1", "-q:v", "2", str(HERE / "trailer-poster.jpg")])
print(f"trailer.mp4  {total:.1f}s  ({len(edit)} shots)")
