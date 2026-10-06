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
    ("flotilla", 0.0, 6.6, "x"),
    ("charter", 0.0, 4.2, "x"),
    ("fish", 0.0, 11.4, "x"),
    ("log", 0.0, 3.6, "x"),
    ("finn", 0.0, 6.0, "x"),
    ("friends", 0.0, 6.0, "x"),
    ("wardrobe", 0.0, 7.8, "x"),
    ("badges", 0.0, 3.8, "b"),
    ("ready", 0.0, 5.2, "x"),
    ("coop", 0.6, 7.2, "x"),
    ("recruit", 0.6, 6.8, "x"),
    ("skins", 0.0, 6.4, "x"),
    ("summon", 0.0, 4.4, "x"),
    ("crewxp", 1.0, 4.8, "b"),
    ("maelstrom", 0.0, 5.6, "x"),
    ("coopdive", 0.6, 9.6, "x"),
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

# ON THE BEAT (beats.py): each cut's middle moved onto the nearest beat of the
# theme (as it plays in the film, from M_IN), by stretching or trimming the
# shot before it a little, never past what the clip holds.
M_IN = 3.0
BEATS = []
if (CLIPS / "beats.json").exists():
    BEATS = [b - M_IN for b in json.loads((CLIPS / "beats.json").read_text())["beats"] if b > M_IN]
if BEATS:
    t0 = 0.0
    for i in range(len(edit) - 1):
        name, dur, kind = edit[i]
        room = marks[name]["dur"] - OFF.get(name, 0.0)
        fd = BK if kind == "b" else XF
        cut_mid = t0 + dur - fd / 2.0
        near = min(BEATS, key=lambda b: abs(b - cut_mid))
        if abs(near - cut_mid) <= 0.45:
            nd = dur + (near - cut_mid)
            if 2.0 <= nd <= room:
                dur = nd
        edit[i] = (name, dur, kind)
        t0 += dur - fd

# Slow push-ins on the shots that are a sheet of paper (Kong: menus that sit
# still read as screenshots).
PUSH = {"charter", "log", "finn", "friends", "badges", "ready", "recruit", "skins", "draft", "g_records", "wardrobe"}

inputs = []
parts = []
for i, (name, dur, _t) in enumerate(edit):
    m = marks[name]
    d = min(dur, m["dur"])
    inputs += ["-i", str(CLIPS / f"{name}.avi")]
    st0 = m["start"] + OFF.get(name, 0.0)
    d = min(d, m["dur"] - OFF.get(name, 0.0))
    push = ""
    if name in PUSH:
        nfr = max(1, int(d * 60))
        push = (f",scale=3840:2160:flags=lanczos,zoompan=z='1+0.045*on/{nfr}':d=1:"
                f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60")
    parts.append(f"[{i}:v]trim=start={st0:.4f}:duration={d:.4f},setpts=PTS-STARTPTS,fps=60,scale=1920:1080:flags=lanczos{push},format=yuv420p,settb=AVTB[v{i}];"
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
fight_at = starts[[e[0] for e in edit].index("ready")] if "ready" in [e[0] for e in edit] else length * 0.35
end_at = starts[-1]
total = length

# The score: the main theme, start to finish (Kong: one track, no switching).
inputs += ["-i", str(ART / "fishingsoundtrack.ogg"), "-i", str(ART / "fishingperfect.mp3")]
n = len(edit)
m_in = max(0.0, min(M_IN, 122.6 - total))   # the theme is 122.8s: never run off its end
fc += (f"[{n}:a]atrim=start={m_in:.2f}:duration={total:.3f},asetpts=PTS-STARTPTS,aresample=48000,"
       f"afade=t=in:d=1.2,afade=t=out:st={total - 3.0:.3f}:d=3.0[score];"
       f"[{cur_a}]volume={SFX_DB}dB,asplit=2[sfx][key];"
       # The score ducks a touch under the game's big sounds.
       f"[score][key]sidechaincompress=threshold=0.04:ratio=3:attack=15:release=350:makeup=1[ducked];"
       # A sting as the name lands on the end card.
       f"[{n + 1}:a]adelay={int((end_at + 0.6) * 1000)}|{int((end_at + 0.6) * 1000)},volume=-4dB,aresample=48000[sting];"
       f"[ducked][sfx][sting]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89,loudnorm=I=-14:TP=-1.5:LRA=11[aout];"
       # One gentle grade over the whole film, and a soft vignette.
       f"[{cur_v}]eq=contrast=1.04:saturation=1.07:gamma=0.98,vignette=angle=PI/5:mode=forward,"
       f"fade=t=in:d=0.8,fade=t=out:st={total - 1.2:.3f}:d=1.2[vout]")

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
