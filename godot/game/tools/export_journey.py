# The Captain's Log's journey (web lib/core/badgesPage.ts, the goal groups)
# -> content/journey.json: each group's title, flavour and accent, and each
# goal's badge id, label, what it measures (the web's variable name, which the
# port maps where it keeps the same count) and its target when it is a plain
# number. The port's own badge text (port_rules badgeText) is the description.
# Run from godot/game: python tools/export_journey.py
import json, re, pathlib

src = pathlib.Path("../../web/lib/core/badgesPage.ts").read_text(encoding="utf-8")
body = src[src.index("const groups: JourneyGroup[] = ["):src.index("const allGoals")]

STR = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)"""


def unq(s):
    s = s.strip()
    q = s[0]
    s = s[1:-1]
    return s.replace("\\" + q, q)


groups = []
for block in re.split(r"\n    \{\n", body)[1:]:
    t = re.search(r"title:\s*" + STR, block)
    if not t:
        continue
    g = {
        "title": unq(t.group(1)),
        "flavor": unq(re.search(r"flavor:\s*" + STR, block).group(1)),
        "accent": unq(re.search(r"accent:\s*" + STR, block).group(1)),
        "goals": [],
    }
    for m in re.finditer(r"badgeGoal\(\s*" + STR + r",\s*" + STR + r",\s*" + STR + r",\s*(.+?),\s*([^,]+?),\s*'/[^']*'", block):
        cur = m.group(4).strip()
        tgt = m.group(5).replace("_", "")
        goal = {"id": unq(m.group(1)), "label": unq(m.group(2))}
        if re.fullmatch(r"[A-Za-z][\w.]*", cur):
            goal["measure"] = cur
        if re.fullmatch(r"\d+", tgt):
            goal["target"] = int(tgt)
        goal["binary"] = "binary: true" in block[m.end():block.find("\n", m.end())]
        g["goals"].append(goal)
    groups.append(g)

out = pathlib.Path("content/journey.json")
out.write_text(json.dumps({"groups": groups}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(len(groups), "groups,", sum(len(g["goals"]) for g in groups), "goals")
