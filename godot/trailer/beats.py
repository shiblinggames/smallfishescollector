# The main theme's beat grid (for cut.py to land its cuts on): an onset
# envelope by spectral flux, the tempo by autocorrelation, the phase by the
# best fit. Writes clips/beats.json: { "bpm", "beats": [seconds...] }.
import json, subprocess, pathlib
import numpy as np

FF = r"C:\Users\Kong\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
HERE = pathlib.Path(__file__).resolve().parent
SR = 22050
raw = subprocess.run([FF, "-v", "error", "-i", str(HERE.parent / "game" / "art" / "fishingsoundtrack.ogg"), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
hop, win = 512, 2048
frames = 1 + (len(x) - win) // hop
w = np.hanning(win)
mag = np.abs(np.fft.rfft(np.stack([x[i * hop:i * hop + win] * w for i in range(frames)]), axis=1))
mag = np.log1p(mag * 10)
flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
flux = (flux - flux.mean()) / (flux.std() + 1e-9)
fps = SR / hop
# Tempo: autocorrelation over 70..160 bpm.
ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
lags = np.arange(len(ac))
bpm_of = lambda l: 60.0 * fps / l
cand = [(ac[l], l) for l in range(int(60 * fps / 160), int(60 * fps / 70) + 1)]
lag = max(cand)[1]
period = lag
# Phase: the offset whose comb sums the most onset.
best = max(range(int(period)), key=lambda o: flux[o::int(period)].sum() if True else 0)
# refine period with fractional lag
per = period
beats = []
t = best
while t < len(flux):
    beats.append(round(t / fps, 3))
    t += per
out = {"bpm": round(bpm_of(per), 2), "beats": beats}
(HERE / "clips" / "beats.json").write_text(json.dumps(out))
print(out["bpm"], len(beats), beats[:8])
