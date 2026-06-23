---
name: deploy
description: Typecheck, commit, and push to master so Vercel auto-deploys seasthebooty.com. Use when the user says deploy, ship, or push it.
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(rm -rf web/.next/types) Bash(node_modules/.bin/tsc *) Bash(cd *)
---

Ship the current changes. The app lives in the `web/` subdir; pushing to
`master` triggers Vercel auto-deploy (no CLI, no manual build step).

Steps:

1. **Typecheck first.** From `web/`:
   ```
   rm -rf .next/types && node_modules/.bin/tsc --noEmit
   ```
   If it reports errors, STOP and show them — do not commit a broken build.

2. **Commit** from the repo root. Stage everything, write a clear, specific
   message (what changed + why), and end the message with:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
   If new code references a freshly-added asset under `web/public/`, make sure
   the asset is staged in the same commit (`git status` for untracked files).

3. **Push to master:**
   ```
   git push
   ```

4. **Confirm.** Vercel picks up the push and deploys automatically — tell the
   user it's pushed and deploying. There is no deploy CLI to run and no need to
   poll a build.

Notes:
- This is Git Bash on Windows. Use POSIX syntax; the working dir resets to the
  repo root between Bash calls, so `cd web && ...` when running tsc.
- Don't skip the typecheck. A clean `tsc --noEmit` is the gate before every push.
