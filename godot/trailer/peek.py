# A contact sheet of recorded clips: frames at the start, middle and end of
# each shot (from its MARK). python peek.py name... -> clips/peek.png
import json, subprocess, sys, pathlib
from PIL import Image, ImageDraw

FF = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
HERE = pathlib.Path(__file__).resolve().parent
CLIPS = HERE / "clips"
marks = json.loads((CLIPS / "marks.json").read_text())
names = sys.argv[1:] or list(marks)
fracs = [0.08, 0.35, 0.65, 0.95]
W, H = 480, 270
sheet = Image.new("RGB", (W * len(fracs), H * len(names)))
for r, n in enumerate(names):
    m = marks[n]
    for c, f in enumerate(fracs):
        t = m["start"] + m["dur"] * f
        out = CLIPS / f"_p{r}{c}.png"
        subprocess.run([FF, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(CLIPS / f"{n}.avi"), "-frames:v", "1", str(out)])
        if out.exists():
            im = Image.open(out).convert("RGB").resize((W, H))
            ImageDraw.Draw(im).text((8, 8), f"{n} {t - m['start']:.1f}s", fill=(255, 255, 0))
            sheet.paste(im, (c * W, r * H))
            out.unlink()
sheet.save(CLIPS / "peek.png")
print("ok")
