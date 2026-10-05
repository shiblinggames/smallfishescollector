# The seams: for every shot in cut.py's EDIT, frames at its first moment and
# its last, so a cut that lands mid-popup shows. -> clips/seams.png
import json, subprocess, pathlib, re, ast
from PIL import Image, ImageDraw

FF = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
HERE = pathlib.Path(__file__).resolve().parent
CLIPS = HERE / "clips"
marks = json.loads((CLIPS / "marks.json").read_text())
src = (HERE / "cut.py").read_text(encoding="utf-8")
EDIT = ast.literal_eval(src[src.index("EDIT = [") + 7:src.index("]\n", src.index("EDIT = [")) + 1])
W, H = 384, 216
cols = [("in", 0.15), ("in+", 0.7), ("out-", -1.1), ("out", -0.35)]
sheet = Image.new("RGB", (W * len(cols), H * len(EDIT)))
for r, (name, off, dur, _t) in enumerate(EDIT):
    if name not in marks:
        continue
    st = marks[name]["start"] + off
    for c, (lab, at) in enumerate(cols):
        t = st + (at if at > 0 else dur + at)
        out = CLIPS / "_s.png"
        subprocess.run([FF, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(CLIPS / f"{name}.avi"), "-frames:v", "1", str(out)])
        if out.exists():
            im = Image.open(out).convert("RGB").resize((W, H))
            ImageDraw.Draw(im).text((6, 6), f"{name} {lab}", fill=(255, 255, 0))
            sheet.paste(im, (c * W, r * H))
sheet.save(CLIPS / "seams.png")
print("ok")
