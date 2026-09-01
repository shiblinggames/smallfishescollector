# -*- coding: utf-8 -*-
"""
THE HOMESTEAD, FIVE TIMES, EACH ONE THE LAST ONE PLUS SOMETHING.

Five separate generations of "an island with a house on it" would give five
different islands: the coastline would move, the light would swing round, the
house would change roof pitch. Upgrading would read as a cut to somewhere else
rather than as your own place being added to, which is the whole point of the
ladder.

So the rungs are CHAINED. Rung 1 is generated cold; every rung after it is
generated FROM the previous rung's own image, with a prompt that says keep all
of this and add these things. kie hands back a URL for each result, and that URL
is what feeds the next call, so nothing needs hosting anywhere.
"""
import json, os, sys, time, urllib.request, urllib.error, pathlib

BASE = "https://api.kie.ai/api/v1/jobs"
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".art-out")
OUT.mkdir(parents=True, exist_ok=True)


def load_key():
    for p in [pathlib.Path.home() / ".claude/skills/nano-banana-2/.env",
              pathlib.Path.home() / ".claude/.env", pathlib.Path(".env")]:
        if p.exists():
            for line in p.read_text(encoding="utf-8-sig").splitlines():
                if line.strip().startswith("KIE_API_KEY"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    if os.environ.get("KIE_API_KEY"):
        return os.environ["KIE_API_KEY"]
    sys.exit("no KIE_API_KEY found")


KEY = load_key()


def api(url, payload=None):
    req = urllib.request.Request(
        url, method="POST" if payload else "GET",
        data=json.dumps(payload).encode() if payload else None,
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def find_url(o):
    out = []
    def walk(x):
        if isinstance(x, str):
            if x.startswith("http") and any(x.lower().split("?")[0].endswith(e)
                                            for e in (".png", ".jpg", ".jpeg", ".webp")):
                out.append(x)
            else:
                try: walk(json.loads(x))
                except Exception: pass
        elif isinstance(x, dict):
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(o)
    return out[0] if out else None


def generate(prompt, out_path, refs=None, aspect="3:2", tries=3):
    for attempt in range(tries):
        payload = {"model": "nano-banana-2", "input": {
            "prompt": prompt, "aspect_ratio": aspect,
            "resolution": "2K", "output_format": "png"}}
        if refs:
            payload["input"]["image_input"] = refs
        resp = api(BASE + "/createTask", payload)
        tid = (resp.get("data") or {}).get("taskId")
        if not tid:
            print("  no taskId:", json.dumps(resp)[:300]); continue
        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(5)
            info = api(BASE + "/recordInfo?taskId=" + tid)
            state = ((info.get("data") or {}).get("state") or "").lower()
            if state in ("success", "succeeded", "completed"):
                # ONLY resultJson. `data.param` echoes the request back as a
                # JSON string, and the request now CONTAINS an image url - the
                # previous rung, fed in as the reference. A scan of the whole
                # response finds that first and happily "downloads" the picture
                # it was asked to change, so every rung came out identical.
                url = find_url((info.get("data") or {}).get("resultJson"))
                if not url:
                    print("  done but no url"); break
                # A PLAIN urlretrieve GETS 403 from the CDN: it sends Python's
                # own User-Agent and the edge rejects it. Ask like a browser.
                dl = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(dl, timeout=180) as r, open(out_path, "wb") as f:
                    f.write(r.read())
                print("  saved", out_path, os.path.getsize(out_path), "bytes")
                return url
            if state in ("fail", "failed", "error"):
                print("  failed, retrying"); break
        else:
            print("  timed out")
    return None


# ── THE PLATE ───────────────────────────────────────────────────────────────
# Every rung is a cutout that stands on a procedurally drawn island, so it is
# painted on magenta and keyed, exactly like every other sprite on this chart.
STYLE = (
    "Hand-painted 2D game art. Soft gouache and watercolour with warm brown ink linework, "
    "visible brush texture, gentle washes rather than hard cel shading or airbrushing. "
    "Storybook illustration style, warm and inviting. Not photographic, not a 3D render, "
    "no glossy highlights, no neon. Even, soft, late-afternoon daylight from the upper left, "
    "with soft contact shadows on the ground directly beneath each structure.\n\n"
    "VIEW: a slightly raised three-quarter view looking down at about 25 degrees, as if from a "
    "boat a short way offshore. Wider than it is tall. Everything sits on a single small patch "
    "of grassy, rocky ground whose lower edge runs roughly straight across the bottom of the "
    "image, so the whole scene can be cut out and stood on an island.\n\n"
    "BACKGROUND: FLAT SOLID PURE MAGENTA, hex FF00FF, filling every pixel that is not the "
    "settlement or the ground it stands on. No sky, no sea, no horizon, no clouds, no distant "
    "land, no gradient, no texture, no vignette, no cast shadow on the background."
)

AVOID = ("sky, sea, ocean, water, horizon, clouds, gradient background, textured background, "
         "vignette, frame, border, top-down view, bird's eye, overhead map view, isometric grid, "
         "flat elevation, straight-on front view, photorealistic, 3D render, CGI, photograph, "
         "people, person, character, figures, boats, ships, text, letters, labels, signage, "
         "watermark, signature, neon colours, oversaturated, harsh cel shading, thick black outlines")

RUNGS = [
    ("home-isle-1", None,
     "A single humble LEAN-TO shelter on a small patch of windswept grassy headland: a sloping "
     "roof of weathered grey driftwood planks and patched canvas sailcloth propped against a low "
     "rock, one open side, a stone fire ring outside it with a battered kettle, a coil of rope and "
     "two lobster pots stacked beside the door. Sparse tufts of coarse grass and a few pale rocks. "
     "Poor, salvaged, and clearly somewhere somebody has only just started living."),

    ("home-isle-2",
     "This is the same small island. KEEP EVERYTHING EXACTLY AS IT IS: the same viewpoint, the "
     "same angle, the same ground and rocks in the same places, the same light and shadow "
     "direction, the same painting style, the same flat magenta background. Do not move the "
     "camera and do not redraw the coastline.\n\nCHANGE ONLY THIS: ",
     "replace the lean-to with a proper small COTTAGE standing on the same spot, built of the same "
     "weathered timber but finished: whitewashed daub between the beams, a slate roof, a stone "
     "chimney with a wisp of smoke, a green-painted door and two small windows. Then ADD, on the "
     "open ground beside it, a KITCHEN GARDEN: four low raised beds of dark earth with rows of "
     "greens and a lean bean frame, edged with stones, and a worn dirt path running from the "
     "cottage door to the beds. The lean-to's old fire ring stays where it is."),

    ("home-isle-3",
     "This is the same small island. KEEP EVERYTHING EXACTLY AS IT IS: the same viewpoint, the "
     "same angle, the same ground and rocks in the same places, the same light and shadow "
     "direction, the same painting style, the same flat magenta background. The cottage, the "
     "kitchen garden and the path must stay exactly where they are.\n\nCHANGE ONLY THIS: ",
     "extend the cottage into a long LONGHOUSE by adding a second bay onto its far end under one "
     "continuous roofline, so it reads as the same house made longer rather than a new building. "
     "Then ADD: a low dry-stone WALL enclosing the kitchen garden and turning it into a proper "
     "walled garden, with a small wooden gate on the path and two wind-bent trees inside the "
     "wall; a tall wooden DRYING RACK hung with fishing nets; and a stacked WOODPILE against the "
     "longhouse gable."),

    ("home-isle-4",
     "This is the same small island. KEEP EVERYTHING EXACTLY AS IT IS: the same viewpoint, the "
     "same angle, the same ground and rocks in the same places, the same light and shadow "
     "direction, the same painting style, the same flat magenta background. The longhouse, the "
     "walled garden, the trees, the drying rack, the woodpile and the path must all stay exactly "
     "where they are.\n\nCHANGE ONLY THIS: ",
     "raise the longhouse into a two-storey GREAT HALL on the same footprint: a second floor with "
     "dormer windows, a steeper slate roof, a bigger stone chimney and a carved timber porch over "
     "the door. Then ADD: on the higher rocky ground behind the hall, a stone BRAZIER on a short "
     "plinth with a small fire burning in it; and down at the near edge of the ground, a small "
     "timber BOATHOUSE with an open end and a slipway of worn planks running out of the frame."),

    ("home-isle-5",
     "This is the same small island. KEEP EVERYTHING EXACTLY AS IT IS: the same viewpoint, the "
     "same angle, the same ground and rocks in the same places, the same light and shadow "
     "direction, the same painting style, the same flat magenta background. The great hall, the "
     "walled garden, the trees, the drying rack, the woodpile, the boathouse and the path must "
     "all stay exactly where they are.\n\nCHANGE ONLY THIS: ",
     "finish the great hall into an ESTATE: add a square stone tower with a shallow pitched roof "
     "onto one end of the hall, dress the walls in cut pale stone, and add a low stone terrace "
     "with steps down to the path. Then REPLACE the brazier on the high ground behind it with a "
     "tall white-and-slate LIGHTHOUSE: a tapering round tower with a black gallery rail and a "
     "glazed lantern room lit warm gold at the top, a small keeper's store at its foot, and a "
     "short flight of steps up to it."),
]

if __name__ == "__main__":
    prev = None
    for name, keep, body in RUNGS:
        print("===", name)
        prompt = ((keep + body) if keep else body) + "\n\n" + STYLE + "\n\nAvoid: " + AVOID
        url = generate(prompt, str(OUT / (name + ".png")), refs=[prev] if prev else None)
        if not url:
            print("  GAVE UP on", name); break
        prev = url
    print("done")
