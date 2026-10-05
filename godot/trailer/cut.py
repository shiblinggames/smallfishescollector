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
EDIT = [
    ("flotilla", 4.3, "x"),
    ("charter", 4.0, "x"),
    ("fish", 7.6, "x"),
    ("log", 3.6, "x"),
    ("rod", 3.2, "x"),
    ("friends", 3.4, "x"),
    ("finn", 4.0, "x"),
    ("treasure", 3.6, "x"),
    ("crate", 3.6, "x"),
    ("wardrobe", 6.0, "x"),
    ("skins", 3.4, "x"),
    ("badges", 2.4, "b"),
    ("campaign", 3.0, "x"),
    ("ready", 3.2, "x"),
    ("coop", 7.2, "x"),
    ("summon", 4.3, "x"),
    ("recruit", 5.4, "x"),
    ("armory", 2.6, "x"),
    ("forge", 3.1, "x"),
    ("mega", 4.3, "b"),
    ("descent", 4.6, "x"),
    ("draft", 4.2, "x"),
    ("boons", 4.6, "x"),
    ("krust", 3.0, "x"),
    ("don", 4.1, "x"),
    ("haul", 3.5, "b"),
    ("end", 6.5, ""),
]
XF = 0.35     # a crossfade between shots
BK = 0.8      # a dip through black between sections
SFX_DB = -7.0 # the game's own sound, under the score

edit = [e for e in EDIT if e[0] in marks]
missing = [e[0] for e in EDIT if e[0] not in marks]
if missing:
    print("missing shots (left out):", missing)

inputs = []
parts = []
for i, (name, dur, _t) in enumerate(edit):
    m = marks[name]
    d = min(dur, m["dur"])
    inputs += ["-i", str(CLIPS / f"{name}.avi")]
    parts.append(f"[{i}:v]trim=start={m['start']:.4f}:duration={d:.4f},setpts=PTS-STARTPTS,fps=60,scale=1920:1080:flags=lanczos,format=yuv420p,settb=AVTB[v{i}];"
                 f"[{i}:a]atrim=start={m['start']:.4f}:duration={d:.4f},asetpts=PTS-STARTPTS,aresample=48000[a{i}];")
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
fight_at = starts[[e[0] for e in edit].index("campaign")] if "campaign" in [e[0] for e in edit] else length * 0.35
end_at = starts[-1]
total = length

# The score: main theme (from 3s, so its lift lands on the crew), the deep
# track from 44s under the fights, the main theme's opening under the end.
inputs += ["-i", str(ART / "fishingsoundtrack.ogg"), "-i", str(ART / "fishingsoundtrackdeep.ogg"), "-i", str(ART / "fishingsoundtrack.ogg")]
n = len(edit)
x1 = 2.5
x2 = 2.0
fc += (f"[{n}:a]atrim=start=3:duration={fight_at + x1:.3f},asetpts=PTS-STARTPTS,aresample=48000[m1];"
       f"[{n+1}:a]atrim=start=44:duration={end_at - fight_at + x1 + x2:.3f},asetpts=PTS-STARTPTS,aresample=48000[m2];"
       f"[{n+2}:a]atrim=start=0:duration={total - end_at + x2 + 1:.3f},asetpts=PTS-STARTPTS,aresample=48000[m3];"
       f"[m1][m2]acrossfade=d={x1}:c1=tri:c2=tri[m12];"
       f"[m12][m3]acrossfade=d={x2}:c1=tri:c2=tri[mus];"
       f"[mus]atrim=duration={total:.3f},afade=t=in:d=1.2,afade=t=out:st={total - 2.5:.3f}:d=2.5[score];"
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
