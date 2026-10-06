"""THE CHAPTER FLEETS' HULLS, BAKED (Godot port, 2026-10-06).

Kong: bosses wear the hull they drop, the whole chapter fleet in the gang's
colours, on the v3 ships ("you should be using v3 boat images"); the only
chapter-coloured paintings were the old v2-era ships, so the v3 ones are
recoloured here instead: the warm wood takes the chapter's hull colour (its
grain and shading kept), the black canvas its sail colour, the white skulls
and the ropes left as they are. Written to port_art/fleet/<bay>_<ship>.png
(committed; tools/setup.mjs copies it into art/ like the port's other own
art) and straight into art/fleet too, which North.fleet_art hands out. Run
again if the v3 ships are repainted:

    python tools/dye_fleet.py      (from godot/game)
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'art')
OUTS = [os.path.join(HERE, '..', 'port_art', 'fleet'), os.path.join(ART, 'fleet')]
SHIPS = ['sloop', 'schooner', 'brigantine', 'galleon', 'man-o-war']
# bay: (hull, sails), from each chapter skin's own painting.
BAYS = {
    'thread': ('#5a4232', '#6f7a62'),          # I   Finndicate: dark wood, weathered green canvas
    'sunken_hand': ('#ece8de', '#8e9a80'),     # II  Chartmaker: bone white
    'the_coffers': ('#c27c9e', '#857472'),     # III Coffers: dusky pink
    'the_last_fathom': ('#2f4878', '#585c72'),  # IV  Last Fathom: navy
}


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def dye(im, hull, sail):
    rgb = im[..., :3]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-5), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.maximum(d, 1e-5)
    hue = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) / 6.0
    hue = np.where(d > 1e-5, hue, 0)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    # Wood: the warm oranges and browns of the v3 hulls.
    wood = smooth(0.18, 0.35, sat) * (1 - smooth(0.13, 0.17, hue)) * smooth(0.0, 0.02, hue) * smooth(0.06, 0.16, lum)
    # Sails: the black canvas; the white skulls stay.
    sailm = (1 - smooth(0.12, 0.3, sat)) * (1 - smooth(0.32, 0.5, lum)) * (1 - wood)
    shade_w = np.power(np.clip(lum / 0.42, 0, 2), 1.25)[..., None]
    if hull.mean() > 0.7:
        out_w = np.clip(hull * (0.35 + 0.75 * shade_w), 0, 1)
    else:
        out_w = np.clip(hull * (0.12 + 0.95 * shade_w), 0, 1)
    out_s = np.clip(sail * (0.45 + 0.55 * (lum / 0.16)[..., None]), 0, 1)
    o = rgb * (1 - wood[..., None]) + out_w * wood[..., None]
    o = o * (1 - sailm[..., None]) + out_s * sailm[..., None]
    res = im.copy()
    res[..., :3] = o
    return res


def main():
    for out in OUTS:
        os.makedirs(out, exist_ok=True)
    for ship in SHIPS:
        src = os.path.join(ART, 'ship-hero', '%s_v3.png' % ship)
        im = np.array(Image.open(src).convert('RGBA')).astype(float) / 255.0
        for bay, (hull, sail) in BAYS.items():
            pic = Image.fromarray((dye(im, hexc(hull), hexc(sail)) * 255).round().astype(np.uint8), 'RGBA')
            # A 256-colour palette with alpha, as the v3 ships themselves are.
            pic = pic.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            for out in OUTS:
                pic.save(os.path.join(out, '%s_%s.png' % (bay, ship)), optimize=True)
    print('fleet: %d hulls written to port_art/fleet and art/fleet' % (len(SHIPS) * len(BAYS)))


if __name__ == '__main__':
    main()
