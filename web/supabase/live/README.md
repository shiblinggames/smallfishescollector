# The live schema, as SQL

A snapshot of what the production database actually runs: every table, constraint,
function (with its EXECUTE grants), view, index, trigger, policy and pg_cron job.
Written by `scripts/snapshot-schema.mts` through the service-role-only
`admin_schema_snapshot()` function. Files are numbered in rebuild order.

- Re-run after ANY schema change: `npx tsx scripts/snapshot-schema.mts` (from web/).
- Do not edit these files by hand. Change the database, then re-snapshot.
- Secrets are redacted on write (the reconcile-premium job's bearer token).
- `10_platform.md` lists what SQL cannot capture: the realtime publication, storage
  buckets, auth settings and platform-only edge functions.

Why it exists: about 25 of the 35 RPCs the game calls lived only in the database. This is
disaster recovery, and the starting point for a local schema if the game ever runs offline
(docs/systems/steam-port.md, Phase A step 1).
