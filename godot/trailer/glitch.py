# A one-frame glitch finder (Kong, 2026-10-05: things "flickering in the top
# left"): a frame that differs from both its neighbours while they agree is
# something that showed for one frame. Scans the quarters and the whole
# picture of trailer.mp4; prints each time, and writes clips/glitch.png with
# the frame before, the frame, and the frame after for each.
import subprocess, pathlib
import numpy as np
from PIL import Image, ImageDraw

FF = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
HERE = pathlib.Path(__file__).resolve().parent
CLIPS = HERE / "clips"
raw = subprocess.run([FF, "-v", "error", "-i", str(HERE / "trailer.mp4"), "-vf", "scale=96:54,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 54, 96).astype(np.float32)
regions = [(0, 27, 0, 48), (0, 27, 48, 96), (27, 54, 0, 48), (27, 54, 48, 96), (0, 54, 0, 96)]
found = []
for i in range(1, len(a) - 1):
    for (y0, y1, x0, x1) in regions:
        A, B, C = a[i - 1, y0:y1, x0:x1], a[i, y0:y1, x0:x1], a[i + 1, y0:y1, x0:x1]
        dn, dp, nn = np.abs(B - A).mean(), np.abs(B - C).mean(), np.abs(A - C).mean()
        if min(dn, dp) > 5 and nn < min(dn, dp) * 0.4:
            found.append(i)
            break
print(f"{len(a) / 60:.1f}s, {len(found)} one-frame glitches:", [round(i / 60, 2) for i in found])
if found:
    W, H = 480, 270
    sheet = Image.new("RGB", (W * 3, H * len(found)))
    for r, i in enumerate(found):
        for c, k in enumerate([i - 1, i, i + 1]):
            out = CLIPS / "_g.png"
            subprocess.run([FF, "-v", "error", "-y", "-ss", f"{k / 60:.4f}", "-i", str(HERE / "trailer.mp4"), "-frames:v", "1", str(out)])
            im = Image.open(out).convert("RGB").resize((W, H))
            ImageDraw.Draw(im).text((6, 6), f"{k / 60:.2f}s", fill=(255, 255, 0))
            sheet.paste(im, (c * W, r * H))
    sheet.save(CLIPS / "glitch.png")
