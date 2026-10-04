"""THE VOYAGES' TABLES for the Godot port (content/voyages.json), read out of
the web's lib/voyageRoutes.ts, lib/voyageRoll.ts and lib/voyageEvents.ts.

The web is frozen, so this ran once (2026-10-04) and its output is committed;
run it again only if those files ever change. Gems are left out on purpose:
the port has none.

    python godot/game/tools/export_voyages.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', '..', '..', 'web', 'lib')


def read(name):
    return open(os.path.join(WEB, name), encoding='utf-8').read()


def lit(s):
    """A TS string literal's body to text."""
    q = s[0]
    body = s[1:-1]
    body = body.replace('\\' + q, q).replace('\\n', '\n')
    # The house copy has no em-dashes; the web's stories had a few.
    return body.replace(' — ', ', ').replace('—', ', ')


STR = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""

routes_src = read('voyageRoutes.ts')
roll_src = read('voyageRoll.ts')
events_src = read('voyageEvents.ts')

routes = {}
block = routes_src[routes_src.index('export const ROUTE_CONFIGS'):]
for key in ['coastal', 'open', 'deep', 'triangle', 'shroud']:
    m = re.search(r'\n  %s: \{(.*?)\n  \},' % key, block, re.S)
    body = m.group(1)
    r = {}
    for f in ['name', 'tagline', 'image', 'riskLabel', 'color']:
        r[f] = lit(re.search(r'\b%s: %s' % (f, STR), body).group(1))
    for f in ['payoutScale', 'baseCrewLossChance', 'baseDoubloons', 'minShipTier', 'minLevel']:
        r[f] = float(re.search(r'\b%s: ([\d.]+)' % f, body).group(1))
    routes[key] = r

payouts = {}
for m in re.finditer(r'(\w+):\s*\{ doubloons: ([\d_]+),\s*gems: [\d_]+,\s*xp: ([\d_]+), crewXp: ([\d_]+),\s*difficulty: ([\d_]+)\s*\}', roll_src):
    payouts[m.group(1)] = {
        'doubloons': float(m.group(2).replace('_', '')), 'xp': float(m.group(3).replace('_', '')),
        'crewXp': float(m.group(4).replace('_', '')), 'difficulty': float(m.group(5).replace('_', '')),
    }

pools = {}
for m in re.finditer(r'const ([A-Z_]+) = \[(.*?)\n\]', events_src, re.S):
    items = []
    for it in re.finditer(r'\{ title: %s,\s*narrative: %s \}' % (STR, STR), m.group(2)):
        items.append({'title': lit(it.group(1)), 'narrative': lit(it.group(2))})
    if items:
        pools[m.group(1)] = items

lure = {}
lm = re.search(r'LURE_RATE_PER_EVENT[^{]*\{(.*?)\}', events_src, re.S)
for m in re.finditer(r'(\w+):\s*([\d.]+)', lm.group(1)):
    lure[m.group(1)] = float(m.group(2))

out = {
    '_about': 'The voyages, from the web (tools/export_voyages.py). Gems left out: the port has none.',
    'routes': routes, 'payouts': payouts, 'pools': pools, 'lureRatePerEvent': lure,
    'goldenShare': 0.30, 'outcomeMult': {'triumph': 1.25, 'success': 1.0, 'setback': 0.75},
    'fortuneRef': 25, 'bootyChance': 0.01, 'bootyMult': 10,
}
assert len(routes) == 5 and len(payouts) == 5 and len(lure) == 5, (len(routes), len(payouts), len(lure))
assert set(pools) >= {'DISCOVERY_SUCCESS', 'ENCOUNTER_CRUSH', 'DANGER_SETBACK', 'WEATHER_FAIL', 'PEACEFUL_SOLO', 'PEACEFUL_CREW', 'ENCOUNTER_CREW_LOSS', 'DANGER_CREW_LOSS'}, sorted(pools)
json.dump(out, open(os.path.join(HERE, '..', 'content', 'voyages.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('voyages.json:', {k: len(v) for k, v in pools.items()})
