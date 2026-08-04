# art-src

Source art that scripts SLICE or NORMALIZE into the real assets. Nothing in
here is ever served: `public/` is the served directory, and these were sitting
in it purely because that is where they were first dropped.

| what | consumed by | output |
|---|---|---|
| `newfishing*.png` | `normalize-fishing-sprites.mjs` | per-variant fishing sprites in `public/` |

Badge sheets (`badgebatch*.png`) deliberately do NOT live here. They are
gitignored where they sit in `public/`, so they never reach a deploy either,
and moving them here would UN-ignore them and commit ~100MB.
