// ──────────────────────────────────────────────────────────────────────────
// Tides. Mid-raid roguelike event interrupts.
// ──────────────────────────────────────────────────────────────────────────
// A raid declares a couple of slots (between-fight encounter indices) +
// a max tier. At raid start, N tides are drawn at random from TIDE_POOL
// filtered to tier <= maxTier (no repeats within a run). After fight N
// where slots includes N, the modal fires; the player picks a choice;
// its effects are added to the run's active effects array. Effects are
// run-scoped (cleared on raid end / retry / leave).
//
// The Cartographer's raid is the first to use Tides; future longer raids declare
// higher maxTier to pull in stronger effects. Numbers scale per tier
// (philosophy A: same effect kinds throughout, just bigger numbers).
//
// IMPORTANT: every effect kind here must also be applied somewhere in
// the combat path (RaidCombat / RaidGame). Adding a new kind is two
// things: (1) extend the TideEffect union, (2) wire it into the matching
// roll / HP / charge path.
//
// COPY CONVENTIONS (audited 2026-06-06):
//   - Choice descriptions are plain English: benefit first, then cost
//     in a second sentence. Numbers always explicit, no jargon.
//   - "cannonballs" everywhere (not "charges" or "shots").
//   - Scopes: "next fight" / "boss fight" / "all run". Never "for one
//     upcoming fight" or "on the next fight" (inconsistent).
//   - HP changes phrased "+N HP" / "-N HP" / "starts with N less HP",
//     never "at -N HP" (ambiguous. Looks like a total).
//   - Effect chips (describeEffect) mirror the description's vocab.

/** Discrete effect kinds. Each carries the data needed to apply it.
 *  Some are run-scoped, some are one-fight, some are one-shot tokens.
 *  Scope is baked into the kind name or noted in a `scope` field.   */
export type TideEffect =
  // ── Broad outgoing damage ────────────────────────────────────────
  /** Multiplier on EVERY outgoing damage roll (fire AND volley). */
  | { kind: 'damageMult'; mult: number }
  // ── Per-action damage (more flavorful than broad damageMult) ────
  /** Fire damage only. Does NOT affect volleys. Encourages reload-fire-reload. */
  | { kind: 'fireDmgMult'; mult: number }
  /** Volley damage only. Does NOT affect base fire. Rewards volley-saving. */
  | { kind: 'volleyDmgMult'; mult: number }
  /** MEGA damage only (the Man-o-War ultimate, 4 charges). Does NOT touch fire
   *  or volley. Dead weight unless the player carries a Mega augment — offered
   *  freely regardless (the draft's call), so the desc says so plainly. */
  | { kind: 'megaDmgMult'; mult: number }
  /** Damage multiplier on NON-crit shots only (hit + graze). <1 = the
   *  "All or Nothing" curse: anything short of a gold crit hits soft. */
  | { kind: 'noncritDmgMult'; mult: number }
  // ── Crit-specific ───────────────────────────────────────────────
  /** Flat % bonus to player crit chance. Aim bar UNAFFECTED visually;
   *  the bonus is rolled into the post-lock outcome math. */
  | { kind: 'critChanceBonus'; chance: number }
  /** Widens the gold critical zone on the aim bar (visual + math). */
  | { kind: 'critZoneScale'; mult: number }
  /** Critical hits deal mult× more damage (stacks with the Gunner's Sight item). */
  | { kind: 'critDmgMult'; mult: number }
  // ── Aim-bar disruptors (visual + feel). Gauntlet curses lean on these.
  /** Drifting fog band over the aim bar (0-1 density), like the Mist Veil. */
  | { kind: 'aimFog'; density: number }
  // Bad Blood (Don's term). Statuses landed on YOU run longer, and at tier 2
  // nothing lifts them. His pool is the one that fights with afflictions, so
  // these only ever have anything to do in his descent.
  | { kind: 'playerStatusDuration'; mult: number }
  | { kind: 'noCleanse' }
  /** Multiplier on the aim NEEDLE sweep speed (>1 = faster, harder to time). */
  | { kind: 'aimSpeedMult'; mult: number }
  /** Multiplier on the target-ZONE drift speed (>1 = the band lurches more). */
  | { kind: 'zoneSpeedMult'; mult: number }
  /** Aim bar randomly blacks out for a beat (0-1 intensity = how dark/often),
   *  like the abyss reel going dark. The "Inkfall" curse. */
  | { kind: 'aimBlackout'; intensity: number }
  /** N drifting DECOY target bands appear on a random fraction of your fires.
   *  Lock onto one and your shot is a dud. Chip damage + the turn ends. The
   *  "False Colors" curse. */
  | { kind: 'aimDecoys'; n: number }
  /** 0-1 chance, each turn, that the action you pick comes out SCRAMBLED. Your
   *  crew does a different (valid) action instead. The "Drowned Whispers" curse. */
  | { kind: 'confuse'; chance: number }
  /** 0-1 chance, rolled per fight, that the enemy's HP bar is HIDDEN. You fight
   *  blind on how close it is to sinking. The "Shrouded Hull" curse. */
  | { kind: 'hideEnemyHp'; chance: number }
  /** 0-1 chance, rolled per fight, that the enemy's loaded-cannonball count is
   *  HIDDEN. No reading when the next broadside comes. "Shuttered Ports" curse. */
  | { kind: 'hideEnemyCharges'; chance: number }
  // ── Elemental builds (Gauntlet boons). Composite effects so one boon tier
  //    carries a whole identity. Fold into the item burn/freeze proc math (the
  //    chances STACK with the matching cannonball, capped in RaidCombat).
  /** Ice build "Permafrost": a freeze chance on hit (skips the enemy's turn) +
   *  bonus damage vs a frozen hull. `brittle` = crits shatter for double the
   *  bonus; `deepFreeze` = the freeze lasts 2 skipped turns. */
  | { kind: 'iceAffinity'; freezeChance: number; frozenDmgMult: number; brittle?: boolean; deepFreeze?: boolean }
  /** Fire build "Wildfire": a burn chance on hit + longer burns (turnsBonus) +
   *  hotter ticks (tickMult). `reignite` = hitting a burning hull refreshes the
   *  duration; `backdraft` = the burn detonates for a burst when it expires. */
  | { kind: 'fireAffinity'; burnChance: number; burnTurnsBonus: number; burnTickMult: number; reignite?: boolean; backdraft?: boolean }
  /** Confluence "Thermal Shock" (Permafrost + Wildfire): when a hit lands on a
   *  hull that is BOTH frozen and burning, the ice shatters in the heat for a
   *  bonus burst of `burstMult`× the hit, consuming the freeze. */
  | { kind: 'thermalShock'; burstMult: number }
  /** Confluence "Coup de Grâce" (Executioner + Cold Fury): a CRITICAL hit that
   *  leaves the enemy at/below `pct` of max HP sinks it outright (a far wider
   *  execute window than the base Executioner, but crit-gated). */
  | { kind: 'critExecute'; pct: number }
  /** Confluence "Hull Render" (Broadside Mastery + Grapeshot): each Volley you
   *  fire THIS fight hits `perVolley` harder than the last (a stacking ramp that
   *  resets every fight). Rewards saving up and slamming repeated volleys. */
  | { kind: 'volleyRamp'; perVolley: number }
  /** Confluence "Reaper's Tithe" (Executioner + Leviathan's Hunger): sinking a
   *  hull heals you `pctMaxHp` of THAT enemy's max HP. */
  | { kind: 'executeHeal'; pctMaxHp: number }
  /** Don's boon "overkill heal": a killing blow that lands for MORE than the
   *  hull had left heals you `pct` of that WASTED (overkill) damage. Only the
   *  excess counts — a clean-to-zero kill heals nothing. Per-hit capped in
   *  RaidCombat like lifesteal so a huge Mega can't refill the whole bar. */
  | { kind: 'overkillHealPct'; pct: number }
  // ── Charge-cost reducers (Don's synergies) ──────────────────────────────
  /** Volley costs `n` fewer cannonballs (floored at 2). The volley cost synergy. */
  | { kind: 'volleyCostReduction'; n: number }
  /** Mega/ultimate costs `n` fewer cannonballs (floored at 3). The mega cost
   *  synergy. Inert without a Mega augment. */
  | { kind: 'megaCostReduction'; n: number }
  /** Confluence "Feed the Fire" (Wildfire + Leviathan's Hunger): each burn tick
   *  on an enemy also heals you `pctTick` of the tick's damage. */
  | { kind: 'burnTickHeal'; pctTick: number }
  /** Confluence "Untouchable" (Following Sea + Ghostward): a successful dodge
   *  refunds `charges` cannonball(s). */
  | { kind: 'dodgeRefund'; charges: number }
  /** Confluence "Iron Tempest" (Spiteful Wake + Ironhide): your reflected (thorns)
   *  damage is multiplied by `mult`. */
  | { kind: 'retaliateBoost'; mult: number }
  // ── Incoming damage / mitigation ────────────────────────────────
  /** Multiplier on incoming damage rolls. <1 = mitigation. */
  | { kind: 'incomingDmgMult'; mult: number; scope: 'nextFight' | 'allRemaining' }
  /** Reduces enemy crit-chance against the player. */
  | { kind: 'incomingCritReduction'; chance: number }
  // ── HP. Instant + per-fight ────────────────────────────────────
  /** Apply RIGHT NOW (modal-time): heal +N HP (clamped to max). */
  | { kind: 'instantHeal'; n: number }
  /** Apply right now: heal a FRACTION of max HP. Scales with the hull so it
   *  stays meaningful at high level (the pct version of instantHeal). */
  | { kind: 'instantHealPct'; pct: number }
  /** Apply right now: full HP restore to max. */
  | { kind: 'fullHeal' }
  /** Delta applied at the START of the next fight (negative = wound). */
  | { kind: 'startHpDelta'; n: number; scope: 'nextFight' | 'boss' }
  /** Delta applied at the START of a fight as a FRACTION of max HP (negative =
   *  wound). Scales with the hull so a wound still bites at high level. The
   *  pct version of startHpDelta. */
  | { kind: 'startHpPctDelta'; pct: number; scope: 'nextFight' | 'boss' }
  /** Passive heal at the START of each REMAINING fight (flat HP). */
  | { kind: 'startOfFightHeal'; n: number }
  /** Passive heal at the START of each REMAINING fight, as a fraction of max
   *  HP. Scales with the hull so it doesn't fall off late (Bilge Pump). */
  | { kind: 'startOfFightHealPct'; pctMax: number }
  // ── Charges (cannonballs) ───────────────────────────────────────
  /** Extra charges at the START of fights. scope=allRemaining for run,
   *  oneFight for a single upcoming encounter.
   *  Sentinel: n <= -10 means "set to 0 for that fight" (clamped on
   *  apply). describeEffect renders this as "Start with 0 cannonballs". */
  | { kind: 'startCharges'; n: number; scope: 'nextFight' | 'allRemaining' }
  /** % chance per reload to gain +bonus extra cannonballs (procs feel cool). */
  | { kind: 'reloadProc'; chance: number; bonusCharges: number }
  // ── Dodge / speed ───────────────────────────────────────────────
  /** +X% to player dodge rolls. */
  | { kind: 'dodgeBonus'; chance: number; scope: 'nextFight' | 'allRemaining' }
  /** Bonus successful dodges (no roll needed) usable on upcoming turns. */
  | { kind: 'guaranteedDodge'; n: number }
  /** +/- player Initiative (hull speed): turn order + fleeing only. Post-split it
   *  does NOT touch the aim bar or the player's dodge — those ride on Evasion
   *  (Navigation). `_fights` is a runtime countdown for the next2Fights scope
   *  (set by expireAfterFight); leave it unset in the pool. */
  | { kind: 'speedDelta'; n: number; scope: 'next2Fights' | 'allRemaining'; _fights?: number }
  /** Weather Gauge confluence: flat % chance each fight to seize the opening
   *  (auto-win turn order), over and above the Initiative roll. */
  | { kind: 'firstStrikeChance'; chance: number }
  /** Weather Gauge / Hobble confluences: when you WIN a turn's opening and land a
   *  shot, % chance it strikes a second time (excludes the Mega). */
  | { kind: 'doubleStrikeOnFirst'; chance: number }
  // ── Boss-specific ───────────────────────────────────────────────
  /** Player damage multiplier vs the boss only. */
  | { kind: 'bossDamageMult'; mult: number }
  /** Volley damage multiplier vs the boss only. */
  | { kind: 'bossVolleyDmgMult'; mult: number }
  // ── Enemy-side effects (next fight) ─────────────────────────────
  /** Scales next enemy's max HP. <1 = weakened. Applied once. */
  | { kind: 'enemyHpScale'; mult: number; scope: 'nextFight' | 'allRemaining' }
  /** Next enemy starts with N fewer cannonballs (clamped to 0). */
  | { kind: 'enemyStartChargesDelta'; n: number; scope: 'nextFight' | 'allRemaining' }
  /** Every enemy starts each fight behind a barrier worth `pctMax` of its max HP
   *  that soaks your direct hits before its hull (burn bleeds through; Railgun
   *  pierces). A Gauntlet CURSE ("The Warding"). */
  | { kind: 'enemyShield'; pctMax: number }
  // ── Legendary one-of-a-kind effects (Gauntlet boons) ────────────
  /** Instantly sink an enemy the moment its HP drops to <= pct of its max. */
  | { kind: 'executeThreshold'; pct: number }
  /** Heal the player for pct of the damage they deal. */
  | { kind: 'lifestealPct'; pct: number }
  /** Reflect pct of the damage an enemy lands on you back into it (thorns).
   *  `dodgePct` (optional) also chips the enemy for that fraction of a shot you
   *  DODGE. So the boon rewards slipping hits, not only eating them. */
  | { kind: 'retaliatePct'; pct: number; dodgePct?: number }
  /** Bonus damage that scales with MISSING HP. `maxBonus` is the damage bonus
   *  at 0 HP (e.g. 0.45 = up to +45%); it tapers linearly to 0 at full HP. */
  | { kind: 'lowHpDamage'; maxBonus: number }
  /** Carry unfired cannonballs into the next fight, up to `cap` (99 = carry
   *  all, still capped at magazine size). Gauntlet host plumbing. */
  | { kind: 'chargeCarryover'; cap: number }
  /** Start every fight with a damage-absorbing shield worth `pctMax` of max HP;
   *  it soaks incoming hits before the hull does and reforms each fight. */
  | { kind: 'fightShield'; pctMax: number }
  // ── HP scaling (Gauntlet defensive boons). Resolved by the Gauntlet HOST
  //    into the run's LIVE max HP (base × these). RaidCombat just receives the
  //    boosted ceiling as playerHpMax; it does not read these itself. ──
  /** "Reinforced Hull": flat ×mult to max HP for the run. */
  | { kind: 'maxHpMult'; mult: number }
  /** "Deep Hull": +perDepth max HP scaled by current run depth, capped at max. */
  | { kind: 'maxHpPerDepth'; perDepth: number; max: number }
  /** "Salvage Hull": +perKill max HP for every hull sunk this run, capped at max. */
  | { kind: 'maxHpPerKill'; perKill: number; max: number }
  /** "Field Repairs" / "Engorge" confluences: heals may exceed max HP into
   *  temporary overhealth worth up to `pct` of max, shed at fight end (never
   *  carries to the next fight. The host clamps carried HP to max). */
  | { kind: 'overhealPct'; pct: number }
  // Iron Rations (a Term): scales EVERY heal the player receives (crew heals,
  // repair kits, lifesteal, regen, between-fight vigor, reprieves). 0 = nothing
  // heals you at all.
  | { kind: 'healMult'; mult: number }
  /** "Field Repairs": repair-kit healing ×mult. */
  | { kind: 'repairHealMult'; mult: number }
  // ── Momentum / conditional damage (Gauntlet boons) ──────────────
  /** "Rising Tide": +perKill outgoing damage for EVERY enemy sunk this run
   *  (retroactive; bosses count), capped at maxBonus. Run-scoped snowball, *  the host feeds the live kill tally; RaidCombat reads it off `tide`. */
  | { kind: 'killStackDamage'; perKill: number; maxBonus: number }
  /** "Abyssal Bounty": +perDepth outgoing damage scaled by the current run
   *  depth, capped at maxBonus. A live function of depth (no wind-up). */
  | { kind: 'depthScaleDamage'; perDepth: number; maxBonus: number }
  /** "Cannonade": each consecutive CRIT this fight adds +perStack outgoing
   *  damage (up to maxStacks); any non-crit shot resets the streak to 0.
   *  Per-fight, tracked by a streak ref in RaidCombat. */
  | { kind: 'critStreakDamage'; perStack: number; maxStacks: number }
  /** "Counter-Battery": when you fire/volley/mega on the same turn the enemy
   *  fires/volleys AND your shot lands, `chance` to negate their attack while
   *  yours still hits (reuses the frozen-skip on the enemy's step). */
  | { kind: 'counterFireChance'; chance: number }
  // ── Confluences on the new momentum boons ───────────────────────
  /** "Broadside Duel" (Cannonade + Counter-Battery): winning the exchange feeds
   *  your rhythm. A counter fires `chanceBonus` more often (additive on top of
   *  Counter-Battery), adds `bonusStack` extra Cannonade stacks when you crit it,
   *  and refunds `refund` cannonballs. */
  | { kind: 'counterBonus'; refund: number; bonusStack: number; chanceBonus: number }
  /** "Return to Sender" (Counter-Battery + Spiteful Wake): a countered shot is
   *  flung back for `pct` of the enemy's would-be damage. */
  | { kind: 'counterReflect'; pct: number }
  /** "Feeding Frenzy" (Rising Tide + Leviathan's Hunger): lifesteal grows with
   *  every hull sunk this run. +PerKill × kills, capped at `max`. */
  | { kind: 'lifestealKillScale'; perKill: number; max: number }
  /** "Pressure Hull" (Abyssal Bounty + Ironhide): incoming damage is reduced,
   *  scaling with the current depth. The defensive mirror of Abyssal Bounty.
   *  −perDepth × depth, capped at `max`. */
  | { kind: 'depthScaleMitigation'; perDepth: number; max: number }
  // ── Don's Gauntlet (variant 'don') ──────────────────────────────
  /** Rattling Shot / Chainshot: a landed player shot has `chance` to apply a
   *  timed STATUS to the enemy (reuses lib/statuses — weaken/feeble/slowed). */
  | { kind: 'statusOnHit'; status: string; chance: number; magnitude: number; turns: number }
  /** The Mark: the player STARTS each fight under a timed status (e.g. feeble). */
  | { kind: 'playerStartStatus'; status: string; magnitude: number; turns: number }
  // ── Don's Gauntlet Batch B — player-side offense hexes ──────────
  /** Armor-Piercing: your shots ignore `pct` (0-1) of the enemy's barrier. */
  | { kind: 'shieldPierce'; pct: number }
  /** Kraken's Grip: a landed hit has `chance` to STUN the enemy `turns` turns
   *  (reuses the freeze skip-turn machinery). */
  | { kind: 'stunOnHit'; chance: number; turns: number }
  /** Kraken's Grip: the DETERMINISTIC version. Every landed hit adds a stack;
   *  stacks never decay, and the `hits`-th one drags the hull under — held for
   *  `turns` turns, taking `crushPct` of ITS OWN max HP each held turn, then
   *  the stacks reset.
   *
   *  Deliberately not a chance roll. Permafrost is already the coin-flip freeze,
   *  so a second "chance on hit to skip a turn" was a dial position rather than
   *  an identity; a guarantee on a counter is the sharpest contrast available
   *  and it means a legendary can never whiff a whole fight. Crush is priced off
   *  the ENEMY's max HP rather than your damage for the same reason Permafrost
   *  is not: that scales with the depth curve on its own, and it keeps the two
   *  cards answering different questions (amplify me vs. hurt them). */
  | { kind: 'gripStacks'; hits: number; turns: number; crushPct: number }
  /** Loaded for Bear: every `n`-th landed shot is a guaranteed crit. */
  | { kind: 'guaranteedCritEvery'; n: number }
  /** Press-Gang: a landed hit has `chance` to steal a loaded cannonball off the
   *  enemy and ram it into your own rack. */
  | { kind: 'stealCharge'; chance: number }
  // ── Don's Gauntlet Batch B — player-side defense / utility ──────
  /** Cutlass Guard: `chance` to PARRY a landing enemy hit (take nothing) and
   *  lash `reflectPct` (0-1) of the intended blow straight back. */
  | { kind: 'parryChance'; chance: number; reflectPct: number }
  /** Steady Sights: `reduce` (0-1) of aim-bar fog + blackout is cleared; at full
   *  (1) decoys are suppressed too. */
  | { kind: 'aimClarity'; reduce: number }
  /** The Don's Favor: open each fight with ONE random blessing (enrage / fortify
   *  / regen), scaled by `magnitude`. */
  | { kind: 'randomFightBuff'; magnitude: number }
  /** Second Calling: firing a crew ability has `chance` to NOT consume it — the
   *  effect still happens, but the ability stays available (immediate refresh). */
  | { kind: 'abilityRefundChance'; chance: number }
  // ── Don's Gauntlet Batch B — enemy-side curses ──────────────────
  /** The Verdict: enemy ultimates hit ×`dmgMult` and gain an extra charge per
   *  reload with `chargeChance` probability (charge faster). */
  | { kind: 'enemyUltimateBoost'; dmgMult: number; chargeChance: number }
  /** Cutpurse Tide: every enemy gains +`bonus` chance to rip a loaded cannonball
   *  off your rack on a landed hit. */
  | { kind: 'enemyChargeSteal'; bonus: number }
  /** Thornmail: enemies have `chance` to parry your shot outright (it deals
   *  nothing). */
  | { kind: 'enemyParry'; chance: number }
  /** The Tithe: the enemy heals `pct` (0-1) of the damage it lands on you. */
  | { kind: 'enemyLifesteal'; pct: number }
  /** The Undertow: you START each fight under one random debuff (weaken /
   *  feeble / slowed), scaled by `magnitude`. */
  | { kind: 'randomFightDebuff'; magnitude: number }
  /** Flare Storm (Don's curse): the Quartermaster's Flare Barrage burns hotter —
   *  `fuseMult` < 1 tightens the fuse (flares resolve faster) and `dmgMult` > 1
   *  raises the chip per missed flare / tapped feint. Inert on enemies that
   *  carry no flares (decoyCount 0). */
  | { kind: 'flareStorm'; fuseMult: number; dmgMult: number }
  /** Barrier Regrowth (Don's curse): the enemy barrier reknits `pctMax` of its
   *  full value each round before your shot lands, so a slow chip never breaks
   *  through — you must burst. Pairs with an enemyShield grant on the curse. */
  | { kind: 'barrierRegrow'; pctMax: number }
  // ── Meta (post-raid only) ───────────────────────────────────────
  /** Doubloons granted / deducted at raid end. */
  | { kind: 'doubloonsAtRaidEnd'; n: number }

// Drop the one-shot ("next enemy" / next-fight) tide effects once a fight
// resolves. Boss-scope and allRemaining effects survive (they expire at the
// boss fight / raid end). EVERY tide host must run this after each fight, or
// a "next enemy" effect (e.g. enemyHpScale, the half-health tide) silently
// persists for the rest of the run. Centralized so RaidGame and GauntletGame
// can't drift on which effects are one-shot.
export function expireAfterFight(effects: TideEffect[]): TideEffect[] {
  return effects.flatMap<TideEffect>(e => {
    if (e.kind === 'enemyHpScale'          && e.scope === 'nextFight') return []
    if (e.kind === 'enemyStartChargesDelta' && e.scope === 'nextFight') return []
    if (e.kind === 'guaranteedDodge')                             return []
    if (e.kind === 'startCharges'    && e.scope === 'nextFight')  return []
    if (e.kind === 'startHpDelta'    && e.scope === 'nextFight')  return []
    if (e.kind === 'startHpPctDelta' && e.scope === 'nextFight')  return []
    if (e.kind === 'incomingDmgMult' && e.scope === 'nextFight')  return []
    if (e.kind === 'dodgeBonus'      && e.scope === 'nextFight')  return []
    // speedDelta "next 2 fights" is a real 2-fight window: tick a countdown
    // (defaults to 2) and only drop it once both fights have passed.
    if (e.kind === 'speedDelta'      && e.scope === 'next2Fights') {
      const left = (e._fights ?? 2) - 1
      return left > 0 ? [{ ...e, _fights: left }] : []
    }
    return [e]
  })
}

// Is an effect a boon, a cost, or neutral? Drives the buff/cost coloring on
// the tide picker chips so a trade reads at a glance. Lives here (next to
// describeEffect) so any surface that lists effects can color them the same.
export function effectTone(e: TideEffect): 'good' | 'bad' | 'neutral' {
  switch (e.kind) {
    case 'damageMult': case 'fireDmgMult': case 'volleyDmgMult': case 'megaDmgMult':
    case 'bossDamageMult': case 'bossVolleyDmgMult': case 'critZoneScale':
    case 'critDmgMult': case 'noncritDmgMult':
      return e.mult > 1 ? 'good' : e.mult < 1 ? 'bad' : 'neutral'
    case 'aimBlackout':  return e.intensity > 0 ? 'bad' : 'neutral'
    case 'executeThreshold': case 'lifestealPct': case 'retaliatePct':
      return e.pct > 0 ? 'good' : 'neutral'
    case 'lowHpDamage':  return e.maxBonus > 0 ? 'good' : 'neutral'
    case 'fightShield':  return e.pctMax > 0 ? 'good' : 'neutral'
    case 'enemyShield':  return e.pctMax > 0 ? 'bad' : 'neutral'
    case 'startOfFightHealPct': return e.pctMax > 0 ? 'good' : 'neutral'
    case 'instantHealPct':  return e.pct > 0 ? 'good' : 'neutral'
    case 'startHpPctDelta': return e.pct > 0 ? 'good' : e.pct < 0 ? 'bad' : 'neutral'
    case 'chargeCarryover': return 'good'
    case 'incomingDmgMult':
    case 'enemyHpScale':
      return e.mult < 1 ? 'good' : e.mult > 1 ? 'bad' : 'neutral'
    case 'critChanceBonus': case 'incomingCritReduction': case 'dodgeBonus':
      return e.chance > 0 ? 'good' : e.chance < 0 ? 'bad' : 'neutral'
    case 'firstStrikeChance': case 'doubleStrikeOnFirst':
      return e.chance > 0 ? 'good' : 'neutral'
    case 'instantHeal': case 'startOfFightHeal':
    case 'startHpDelta': case 'speedDelta': case 'doubloonsAtRaidEnd':
      return e.n > 0 ? 'good' : e.n < 0 ? 'bad' : 'neutral'
    case 'fullHeal': case 'guaranteedDodge': case 'reloadProc':
      return 'good'
    case 'startCharges':
      return e.n > 0 ? 'good' : 'bad' // n <= 0 (incl. the NO_CHARGES sentinel) is a downside
    case 'enemyStartChargesDelta':
      return e.n < 0 ? 'good' : e.n > 0 ? 'bad' : 'neutral'
    case 'aimFog':       return e.density > 0 ? 'bad' : 'neutral'
    case 'playerStatusDuration': return e.mult > 1 ? 'bad' : 'good'
    case 'noCleanse':    return 'bad'
    case 'aimDecoys':    return e.n > 0 ? 'bad' : 'neutral'
    case 'statusOnHit':       return 'good'  // debuffs the ENEMY
    case 'playerStartStatus': return 'bad'   // debuffs YOU
    case 'shieldPierce':        return 'good'
    case 'stunOnHit':           return 'good'
    case 'gripStacks':          return 'good'
    case 'guaranteedCritEvery': return 'good'
    case 'stealCharge':         return 'good'
    case 'parryChance':         return 'good'
    case 'aimClarity':          return 'good'
    case 'randomFightBuff':     return 'good'
    case 'abilityRefundChance': return 'good'
    case 'overkillHealPct':     return e.pct > 0 ? 'good' : 'neutral'
    case 'volleyCostReduction': case 'megaCostReduction': return e.n > 0 ? 'good' : 'neutral'
    case 'enemyUltimateBoost':  return 'bad'
    case 'enemyChargeSteal':    return 'bad'
    case 'enemyParry':          return 'bad'
    case 'enemyLifesteal':      return 'bad'
    case 'randomFightDebuff':   return 'bad'
    case 'flareStorm':          return 'bad'
    case 'barrierRegrow':       return 'bad'
    case 'confuse':      return e.chance > 0 ? 'bad' : 'neutral'
    case 'hideEnemyHp': case 'hideEnemyCharges': return e.chance > 0 ? 'bad' : 'neutral'
    case 'iceAffinity':  return 'good'
    case 'fireAffinity': return 'good'
    case 'healMult':     return e.mult > 1 ? 'good' : e.mult < 1 ? 'bad' : 'neutral'
    case 'aimSpeedMult': return e.mult > 1 ? 'bad' : e.mult < 1 ? 'good' : 'neutral'
    case 'zoneSpeedMult':return e.mult > 1 ? 'bad' : e.mult < 1 ? 'good' : 'neutral'
    case 'killStackDamage': case 'depthScaleDamage':
    case 'critStreakDamage': case 'counterFireChance':
    case 'counterBonus': case 'counterReflect': case 'lifestealKillScale':
    case 'depthScaleMitigation':
    case 'maxHpMult': case 'maxHpPerDepth': case 'maxHpPerKill':
    case 'overhealPct': case 'repairHealMult':
      return 'good'
    default:
      return 'neutral'
  }
}

export interface TideChoice {
  /** Stable id for analytics / Ledger ordering. */
  id: string
  label: string
  /** Short, plain-English card body: benefit first, then cost. Numbers
   *  explicit. Effect chips render below the description with the
   *  precise mechanic; description sets the trade in plain words so a
   *  player who doesn't scan chips still understands. */
  description: string
  /** Effects fired in order on pick. Can be empty (the safe opt-out). */
  effects: TideEffect[]
}

export interface TideEvent {
  id: string
  /** Tier ladder. See TIER_PHILOSOPHY comment below. */
  tier: 1 | 2 | 3 | 4
  title: string
  /** Italic flavor line shown above the choices. */
  flavor: string
  choices: TideChoice[]
}

// TIER_PHILOSOPHY: same effect kinds at every tier, just bigger numbers.
// Tier 1 ≈ baseline. Tier 2 ≈ 2× the tier 1 magnitudes. Tier 3 ≈ 3–5×.
// Tier 4 = endgame / mythic. New effect kinds CAN be introduced later
// as new raids ship; the union above is append-only friendly.

// Sentinel: pass n: NO_CHARGES (-99) to startCharges to mean "start
// that fight with zero cannonballs." The apply path clamps to 0; the
// describeEffect helper renders it as "Start the fight with 0 cannonballs"
// instead of the meaningless "-99 starting cannonballs."
const NO_CHARGES = -99

export const TIDE_POOL: TideEvent[] = [
  // ── 1 ─────────────────────────────────────────────────────────────
  {
    id: 'drifting_wreck',
    tier: 1,
    title: 'A Drifting Wreck',
    flavor: 'Half a hull no flag claims, dredged from somewhere deeper than these waters should reach.',
    choices: [
      {
        id: 'strip',
        label: 'Strip the hold',
        description: "+10% crit chance all run. Enemies hit you 10% harder all run.",
        effects: [
          { kind: 'critChanceBonus', chance: 0.10 },
          { kind: 'incomingDmgMult', mult: 1.10, scope: 'allRemaining' },
        ],
      },
      {
        id: 'medical',
        label: 'Take the medical chest',
        description: 'Heal 18% of your max HP now. Costs you 50 ⟡ at raid end.',
        effects: [
          { kind: 'instantHealPct', pct: 0.18 },
          { kind: 'doubloonsAtRaidEnd', n: -50 },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail past',
        description: 'Nothing happens. Clean wake.',
        effects: [],
      },
    ],
  },
  // ── 2 ─────────────────────────────────────────────────────────────
  {
    id: 'sounding_bell',
    tier: 1,
    title: 'A Sounding Bell',
    flavor: "A bell tolls through the fog. Either an open invitation, or a trap meant to herd you onto someone's guns.",
    choices: [
      {
        id: 'follow',
        label: 'Follow the bell',
        description: 'It leads to a half-sunk cache: +150 ⟡ at raid end. But the chase leaves you ragged. You enter the boss fight with 8% less HP.',
        effects: [
          { kind: 'doubloonsAtRaidEnd', n: 150 },
          { kind: 'startHpPctDelta', pct: -0.08, scope: 'boss' },
        ],
      },
      {
        id: 'hold',
        label: 'Hold your course',
        description: 'Nothing happens. The safe heading.',
        effects: [],
      },
      {
        id: 'sail_wide',
        label: 'Sail wide of the bell',
        description: '+15% Volley damage in the boss fight. The long way around runs the crew ragged. You enter the boss with 10% less HP.',
        effects: [
          { kind: 'bossVolleyDmgMult', mult: 1.15 },
          { kind: 'startHpPctDelta', pct: -0.10, scope: 'boss' },
        ],
      },
    ],
  },
  // ── 3 ─────────────────────────────────────────────────────────────
  {
    id: 'empty_powder_keg',
    tier: 1,
    title: 'Empty Powder Keg',
    flavor: 'A black-powder cask bobs alongside, lid half-off. Useful to the right captain. Dangerous to the careless one.',
    // Pure boon-pick. No opt-out. Each option is a real trade.
    choices: [
      {
        id: 'refill',
        label: 'Refill stores',
        description: 'Every reload has a 10% chance to load +1 cannonball, all run. Enter the next fight with 8% less HP.',
        effects: [
          { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 },
          { kind: 'startHpPctDelta', pct: -0.08, scope: 'nextFight' },
        ],
      },
      {
        id: 'rig',
        label: 'Rig it as a one-shot',
        description: 'Next enemy starts at 65% HP. Rigging the blast leaves your hull wide open. You take 20% more damage that fight.',
        effects: [
          { kind: 'enemyHpScale', mult: 0.65, scope: 'nextFight' },
          { kind: 'incomingDmgMult', mult: 1.20, scope: 'nextFight' },
        ],
      },
      {
        id: 'heave',
        label: 'Heave it overboard',
        description: '1 guaranteed dodge next fight (no roll needed). Heaving it took the crew off the rail. You enter that fight with 6% less HP.',
        effects: [
          { kind: 'guaranteedDodge', n: 1 },
          { kind: 'startHpPctDelta', pct: -0.06, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 4 ─────────────────────────────────────────────────────────────
  {
    id: 'bottle_in_surf',
    tier: 1,
    title: 'A Bottle in the Surf',
    flavor: "A captain's log fragment, water-stained, readable. From someone who didn't make the next port.",
    choices: [
      {
        id: 'read',
        label: 'Read it',
        description: 'Gold crit zone is 5% wider all run. Enter the next fight with 8% less HP (wheel went unattended).',
        effects: [
          { kind: 'critZoneScale', mult: 1.05 },
          { kind: 'startHpPctDelta', pct: -0.08, scope: 'nextFight' },
        ],
      },
      {
        id: 'pocket',
        label: 'Pocket the bottle',
        description: '+150 ⟡ at raid end. Reading it under way, you let the watch slip. You enter the next fight with 8% less HP.',
        effects: [
          { kind: 'doubloonsAtRaidEnd', n: 150 },
          { kind: 'startHpPctDelta', pct: -0.08, scope: 'nextFight' },
        ],
      },
      {
        id: 'toss',
        label: 'Toss it back',
        description: 'Nothing happens. The bottle drifts on.',
        effects: [],
      },
    ],
  },
  // ── 5 ─────────────────────────────────────────────────────────────
  {
    id: 'wounded_whale',
    tier: 1,
    title: 'A Wounded Whale',
    flavor: 'Entangled in Finndicate netting, dragging the lines deeper.',
    // Boon-pick: every option has a small cost or scope limit.
    choices: [
      {
        id: 'cut_loose',
        label: 'Cut it loose',
        description: '+10% Volley damage all run. The freed whale thrashes through your lines. -2 ship speed for the next 2 fights.',
        effects: [
          { kind: 'volleyDmgMult', mult: 1.10 },
          { kind: 'speedDelta', n: -2, scope: 'next2Fights' },
        ],
      },
      {
        id: 'harvest',
        label: 'Harvest it',
        description: '+10% Fire damage all run. -10% dodge next fight (cries draw attention).',
        effects: [
          { kind: 'fireDmgMult', mult: 1.10 },
          { kind: 'dodgeBonus', chance: -0.10, scope: 'nextFight' },
        ],
      },
      {
        id: 'netting',
        label: 'Take only the netting',
        description: '+2 cannonballs at the start of the next fight. Hauling it aboard leaves the rail exposed. Enter that fight with 5% less HP.',
        effects: [
          { kind: 'startCharges', n: 2, scope: 'nextFight' },
          { kind: 'startHpPctDelta', pct: -0.05, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 6 ─────────────────────────────────────────────────────────────
  {
    id: 'foggy_crosswind',
    tier: 1,
    title: 'A Foggy Crosswind',
    flavor: 'The wind shifts hard against the current. The fog bows but does not lift.',
    choices: [
      {
        id: 'trim',
        label: 'Trim sails for speed',
        description: '+15% Fire damage all run. -2 ship speed for the next 2 fights.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.15 },
          { kind: 'speedDelta', n: -2, scope: 'next2Fights' },
        ],
      },
      {
        id: 'stay',
        label: 'Stay the course',
        description: 'Nothing happens. No trade either way.',
        effects: [],
      },
      {
        id: 'anchor',
        label: 'Drop the sea anchor',
        description: 'Take 12% less damage all run. Riding low and cautious blunts your guns. -8% damage all run.',
        effects: [
          { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' },
          { kind: 'damageMult', mult: 0.92 },
        ],
      },
    ],
  },
  // ── 7 ─────────────────────────────────────────────────────────────
  {
    id: 'sheltered_cove',
    tier: 1,
    title: 'A Sheltered Cove',
    flavor: 'A driftwood inlet behind a rock-spit. Calm water, no enemy sails in sight. A captain could put in here.',
    choices: [
      {
        id: 'beach',
        label: 'Beach the ship and patch the hull',
        description: 'Full HP restored. But the long stop leaves your gun crews rusty. -12% damage all run.',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'damageMult', mult: 0.88 },
        ],
      },
      {
        id: 'quick_patch',
        label: 'Quick patch in the bow',
        description: 'Heal 18% of your max HP now. You enter the boss fight with 10% less HP.',
        effects: [
          { kind: 'instantHealPct', pct: 0.18 },
          { kind: 'startHpPctDelta', pct: -0.10, scope: 'boss' },
        ],
      },
      {
        id: 'sail_on',
        label: 'Sail on',
        description: 'Nothing happens. Save your hull for whatever is ahead.',
        effects: [],
      },
    ],
  },
  // ── 8 ─────────────────────────────────────────────────────────────
  {
    id: 'damage_control_drill',
    tier: 1,
    title: 'A Damage-Control Drill',
    flavor: 'The bo`sun wants a half-hour for the crew. The water around you is empty enough that he might be right.',
    choices: [
      {
        id: 'live_fire',
        label: 'Live-fire drill',
        description: '+6% crit chance all run. The powder spent drilling leaves you thin. You enter the next fight with 5% less HP.',
        effects: [
          { kind: 'critChanceBonus', chance: 0.06 },
          { kind: 'startHpPctDelta', pct: -0.05, scope: 'nextFight' },
        ],
      },
      {
        id: 'damage_control',
        label: 'Damage-control rehearsal',
        description: 'Heal 4% of your max HP at the start of every remaining fight. The crew drills patches, not gunnery. -10% Fire damage all run.',
        effects: [
          { kind: 'startOfFightHealPct', pctMax: 0.04 },
          { kind: 'fireDmgMult', mult: 0.90 },
        ],
      },
      {
        id: 'skip',
        label: 'Skip the drill',
        description: 'Nothing happens. Save the time.',
        effects: [],
      },
    ],
  },

  // ── TIER 2 ────────────────────────────────────────────────────────────
  // Same effect kinds as tier 1, ~2x the magnitudes (and steeper costs).
  // Only drawn when a raid sets maxTier >= 2 (Chapter 3+). Authored 2026-06-24.
  // ── 9 ─────────────────────────────────────────────────────────────
  {
    id: 'maelstrom_pull',
    tier: 2,
    title: "A Maelstrom's Pull",
    flavor: 'The sea opens a slow gray throat off the bow. Ride its edge and it will hurl you forward, or swallow you whole.',
    choices: [
      {
        id: 'ride',
        label: 'Ride the current',
        description: '+16% damage all run. Enemies hit you 20% harder all run.',
        effects: [
          { kind: 'damageMult', mult: 1.16 },
          { kind: 'incomingDmgMult', mult: 1.20, scope: 'allRemaining' },
        ],
      },
      {
        id: 'bail',
        label: 'Brace and bail',
        description: 'Heal 30% of your max HP now. Costs you 100 ⟡ at raid end.',
        effects: [
          { kind: 'instantHealPct', pct: 0.30 },
          { kind: 'doubloonsAtRaidEnd', n: -100 },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail wide',
        description: 'Nothing happens. Clean wake.',
        effects: [],
      },
    ],
  },
  // ── 10 ────────────────────────────────────────────────────────────
  {
    id: 'drowned_armory',
    tier: 2,
    title: 'The Drowned Armory',
    flavor: "A sunken man-o-war's gun deck, still stocked, the powder somehow dry. Take what the sea was keeping.",
    // Pure boon-pick. No opt-out. Each is a real trade.
    choices: [
      {
        id: 'heavy_shot',
        label: 'Load the heavy shot',
        description: '+18% Fire damage all run. The heavy rounds are a slow, back-breaking load. -2 ship speed all run.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.18 },
          { kind: 'speedDelta', n: -2, scope: 'allRemaining' },
        ],
      },
      {
        id: 'powder',
        label: 'Haul the powder aboard',
        description: 'Every reload has a 20% chance to load +1 cannonball, all run. The extra powder weighs the hull down. -1 ship speed all run.',
        effects: [
          { kind: 'reloadProc', chance: 0.20, bonusCharges: 1 },
          { kind: 'speedDelta', n: -1, scope: 'allRemaining' },
        ],
      },
      {
        id: 'plate',
        label: 'Bolt on the hull plate',
        description: 'Take 22% less damage all run. The added weight slows your guns. -12% damage all run.',
        effects: [
          { kind: 'incomingDmgMult', mult: 0.78, scope: 'allRemaining' },
          { kind: 'damageMult', mult: 0.88 },
        ],
      },
    ],
  },
  // ── 11 ────────────────────────────────────────────────────────────
  {
    id: 'sirens_bargain',
    tier: 2,
    title: "A Siren's Bargain",
    flavor: 'A voice in the swell offers a trade, sweet and certain. Bargains struck on open water are always paid in full.',
    choices: [
      {
        id: 'sing_back',
        label: 'Sing back',
        description: '+12% crit chance all run. Enemies hit you 15% harder all run.',
        effects: [
          { kind: 'critChanceBonus', chance: 0.12 },
          { kind: 'incomingDmgMult', mult: 1.15, scope: 'allRemaining' },
        ],
      },
      {
        id: 'ears',
        label: 'Take the song',
        description: 'Full HP restored. But the bargain is paid in full. You take 12% more damage all run.',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'incomingDmgMult', mult: 1.12, scope: 'allRemaining' },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail past',
        description: 'Nothing happens. Hold the line.',
        effects: [],
      },
    ],
  },
  // ── 12 ────────────────────────────────────────────────────────────
  {
    id: 'king_tide',
    tier: 2,
    title: 'The King Tide',
    flavor: 'The whole sea heaves at once, a wave with no weather behind it. Time it right and it carries you onto the boss like a battering ram.',
    choices: [
      {
        id: 'crest',
        label: 'Crest the wave',
        description: '+25% damage in the boss fight. Riding the crest in slams you against the hull. You enter the boss with 12% less HP.',
        effects: [
          { kind: 'bossDamageMult', mult: 1.25 },
          { kind: 'startHpPctDelta', pct: -0.12, scope: 'boss' },
        ],
      },
      {
        id: 'trough',
        label: 'Heal in the trough',
        description: 'Heal 6% of your max HP at the start of every remaining fight. -15% Volley damage all run.',
        effects: [
          { kind: 'startOfFightHealPct', pctMax: 0.06 },
          { kind: 'volleyDmgMult', mult: 0.85 },
        ],
      },
      {
        id: 'ride_out',
        label: 'Ride it out',
        description: '+2 Initiative all run (fire first and flee more reliably). The hard heel into the swell strains the seams. Take 12% more damage all run.',
        effects: [
          { kind: 'speedDelta', n: 2, scope: 'allRemaining' },
          { kind: 'incomingDmgMult', mult: 1.12, scope: 'allRemaining' },
        ],
      },
    ],
  },
  // ── 13 ────────────────────────────────────────────────────────────
  {
    id: 'ghost_convoy',
    tier: 2,
    title: 'A Ghost Convoy',
    flavor: 'A line of ships rides the horizon, lanterns lit, no crew at the rails. They hold formation as if still waiting on orders.',
    choices: [
      {
        id: 'board',
        label: 'Board the lead ship',
        description: 'The next enemy starts at half HP. You take 15% more damage that fight.',
        effects: [
          { kind: 'enemyHpScale', mult: 0.50, scope: 'nextFight' },
          { kind: 'incomingDmgMult', mult: 1.15, scope: 'nextFight' },
        ],
      },
      {
        id: 'flank',
        label: 'Fall in behind them',
        description: '+2 guaranteed dodges next fight (no roll needed). Drifting in their cold wake saps the crew. Enter that fight with 8% less HP.',
        effects: [
          { kind: 'guaranteedDodge', n: 2 },
          { kind: 'startHpPctDelta', pct: -0.08, scope: 'nextFight' },
        ],
      },
      {
        id: 'sail_past',
        label: 'Let them sail on',
        description: 'Nothing happens. Some things are best left to the fog.',
        effects: [],
      },
    ],
  },
]

// ──────────────────────────────────────────────────────────────────────
// Pre-boss reprieve. A guaranteed catch-your-breath choice fired right before
// a hard finale (raids that set `preBossReprieve`). Reuses the TideEvent shape
// so it renders through TideModal. The heal/+damage picks ride the normal tide
// effect path; the 'reprieve_ability' pick has no TideEffect (empty effects) and
// is handled as a side-effect in RaidGame (refresh one spent crew ability).
// ──────────────────────────────────────────────────────────────────────
export const PRE_BOSS_REPRIEVE: TideEvent = {
  id: 'pre_boss_reprieve',
  tier: 1,
  title: "The Don's Gift",
  flavor: 'Don Finleone waves the court back and looks you over, unimpressed. "Half-sunk already? No, no. I did not swim up from the deep to gut some wounded little thing. Patch yourself. Load your guns. Wake a hand. Make this worth my while."',
  choices: [
    {
      id: 'reprieve_heal',
      label: 'Patch the hull',
      description: 'Heal 20% of your max HP before the fight.',
      effects: [{ kind: 'instantHealPct', pct: 0.20 }],
    },
    {
      id: 'reprieve_damage',
      label: 'Sharpen the guns',
      description: '+5% damage for the fight ahead.',
      effects: [{ kind: 'damageMult', mult: 1.05 }],
    },
    {
      id: 'reprieve_ability',
      label: 'Wake a hand',
      description: 'Refresh one spent crew ability, ready for the don.',
      effects: [],
    },
  ],
}

// ──────────────────────────────────────────────────────────────────────
// Draw helper
// ──────────────────────────────────────────────────────────────────────

function shuffleTides(arr: TideEvent[]): TideEvent[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Pick `n` distinct tides for a run. Tier-2 events are big swings, so a run
 *  draws AT MOST ONE of them (and only ~55% of runs roll one at all); the
 *  milder tier-1 pool is the backbone. This kills the old feast-or-famine
 *  where a maxTier-2 raid could stack two run-swinging tier-2 tides. maxTier-1
 *  raids never see tier 2 at all. Returns fewer than `n` only if the pool runs
 *  dry (defensive. Won't happen with 8 tier-1 events and 2 slots). */
export function drawTides(n: number, maxTier: number): TideEvent[] {
  const t1 = shuffleTides(TIDE_POOL.filter(t => t.tier === 1 && t.tier <= maxTier))
  const t2 = shuffleTides(TIDE_POOL.filter(t => t.tier >= 2 && t.tier <= maxTier))
  const picks: TideEvent[] = []
  if (t2.length > 0 && Math.random() < 0.55) picks.push(t2[0])   // at most ONE tier-2
  for (const e of t1) { if (picks.length >= n) break; picks.push(e) }
  // Defensive top-up if the tier-1 pool somehow can't fill the slots.
  if (picks.length < n) for (const e of t2.slice(1)) { if (picks.length >= n) break; picks.push(e) }
  return shuffleTides(picks).slice(0, Math.min(n, picks.length))
}

// ──────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────

/** Friendly one-line description of an effect for the Captain's Ledger
 *  "Active Tides" section AND the chip row on the TideModal choice
 *  cards. Mirrors the wording of the choice descriptions (cannonballs,
 *  next fight / boss fight / all run) so a player who scans either
 *  surface reads the same thing.
 *
 *  Returns '' for marker effects that shouldn't surface (e.g. a
 *  startHpDelta n=0 placeholder); both consumers filter empty strings. */
export function describeEffect(e: TideEffect): string {
  switch (e.kind) {
    case 'damageMult':            return `${pct(e.mult - 1)} damage all run`
    case 'fireDmgMult':           return `${pct(e.mult - 1)} Fire damage`
    case 'volleyDmgMult':         return `${pct(e.mult - 1)} Volley damage`
    case 'megaDmgMult':           return `${pct(e.mult - 1)} Mega damage`
    case 'critChanceBonus':       return `${pct(e.chance)} crit chance`
    case 'critZoneScale':         return `Crit zone ${pct(e.mult - 1)} wider`
    case 'critDmgMult':           return `${pct(e.mult - 1)} critical damage`
    case 'executeThreshold':      return `Sink enemies below ${Math.round(e.pct * 100)}% HP`
    case 'lifestealPct':          return `Heal ${pct(e.pct)} of damage dealt`
    case 'retaliatePct':          return e.dodgePct
                                    ? `Reflect ${Math.round(e.pct * 100)}% of damage taken; chip ${Math.round(e.dodgePct * 100)}% of a shot you dodge`
                                    : `Reflect ${Math.round(e.pct * 100)}% of damage taken`
    case 'lowHpDamage':           return `Up to ${pct(e.maxBonus)} damage as your HP drops`
    case 'thermalShock':          return `Frozen + burning hulls shatter for +${pct(e.burstMult)}`
    case 'critExecute':           return `Crits sink hulls below ${Math.round(e.pct * 100)}% HP`
    case 'volleyRamp':            return `Each Volley this fight hits +${Math.round(e.perVolley * 100)}% harder`
    case 'executeHeal':           return `Sinking a hull heals ${Math.round(e.pctMaxHp * 100)}% of its max HP`
    case 'overkillHealPct':       return `Heal ${Math.round(e.pct * 100)}% of overkill damage`
    case 'volleyCostReduction':   return `Volley costs ${e.n} less cannonball${e.n === 1 ? '' : 's'}`
    case 'megaCostReduction':     return `Mega costs ${e.n} less cannonball${e.n === 1 ? '' : 's'}`
    case 'burnTickHeal':          return `Burn ticks heal you ${Math.round(e.pctTick * 100)}% of the tick`
    case 'dodgeRefund':           return `A dodge refunds ${e.charges} cannonball${e.charges === 1 ? '' : 's'}`
    case 'retaliateBoost':        return `Reflected damage ×${e.mult.toFixed(1)}`
    case 'chargeCarryover':       return e.cap >= 99 ? 'Carry all unfired cannonballs to the next fight' : `Carry up to ${e.cap} cannonball${e.cap === 1 ? '' : 's'} to the next fight`
    case 'fightShield':           return `Shield each fight worth ${Math.round(e.pctMax * 100)}% of max HP`
    case 'enemyShield':           return `Every enemy is barriered for ${Math.round(e.pctMax * 100)}% of its hull each fight`
    case 'incomingDmgMult': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'all run'
      if (e.mult > 1) return `Take ${pct(e.mult - 1)} more damage, ${scope}`
      return `Take ${pct(1 - e.mult)} less damage, ${scope}`
    }
    case 'incomingCritReduction': return e.chance >= 0
      ? `Enemies crit ${Math.round(e.chance * 100)}% less often`
      : `Enemies crit ${Math.round(-e.chance * 100)}% more often`
    case 'instantHeal':           return `+${e.n} HP now`
    case 'instantHealPct':        return `Heal ${Math.round(e.pct * 100)}% max HP now`
    case 'fullHeal':              return 'Full HP restored'
    case 'startHpDelta': {
      if (e.n === 0) return ''   // marker only
      const sign = e.n >= 0 ? '+' : ''
      const scope = e.scope === 'boss' ? 'boss fight' : 'next fight'
      return `${sign}${e.n} HP entering ${scope}`
    }
    case 'startHpPctDelta': {
      if (e.pct === 0) return ''
      const scope = e.scope === 'boss' ? 'the boss fight' : 'the next fight'
      return e.pct >= 0
        ? `+${Math.round(e.pct * 100)}% max HP entering ${scope}`
        : `Enter ${scope} with ${Math.round(-e.pct * 100)}% less HP`
    }
    case 'startOfFightHeal':      return `+${e.n} HP at every fight start`
    case 'startOfFightHealPct':   return `Heal ${Math.round(e.pctMax * 100)}% max HP each fight`
    case 'startCharges': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'every fight'
      if (e.n <= -10) return `0 cannonballs ${scope}`
      if (e.n < 0)    return `${e.n} starting cannonball${Math.abs(e.n) === 1 ? '' : 's'} ${scope}`
      return `+${e.n} starting cannonball${e.n === 1 ? '' : 's'} ${scope}`
    }
    case 'reloadProc':            return `${pct(e.chance)} chance per reload for +${e.bonusCharges} cannonball${e.bonusCharges === 1 ? '' : 's'}`
    case 'dodgeBonus': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'all run'
      return `${pct(e.chance)} dodge, ${scope}`
    }
    case 'guaranteedDodge':       return `${e.n} guaranteed dodge${e.n === 1 ? '' : 's'}`
    case 'speedDelta': {
      const scope = e.scope === 'allRemaining' ? 'all run' : 'next 2 fights'
      return `${e.n >= 0 ? '+' : ''}${e.n} Initiative, ${scope}`
    }
    case 'firstStrikeChance':     return `${Math.round(e.chance * 100)}% to seize the opening (go first)`
    case 'doubleStrikeOnFirst':   return `Your opening shot: ${Math.round(e.chance * 100)}% to strike twice`
    case 'bossDamageMult':        return `${pct(e.mult - 1)} damage to boss`
    case 'bossVolleyDmgMult':     return `${pct(e.mult - 1)} Volley damage to boss`
    case 'enemyHpScale': {
      const who = e.scope === 'allRemaining' ? 'Enemies' : 'Next enemy'
      return e.mult >= 1 ? `${who} ${Math.round((e.mult - 1) * 100)}% tougher` : `${who} ${Math.round((1 - e.mult) * 100)}% weaker`
    }
    case 'enemyStartChargesDelta': {
      const who = e.scope === 'allRemaining' ? 'Enemies' : 'Next enemy'
      return e.n < 0
        ? `${who} start with ${Math.abs(e.n)} fewer cannonball${Math.abs(e.n) === 1 ? '' : 's'}`
        : `${who} open every fight loaded (+${e.n} cannonball${e.n === 1 ? '' : 's'})`
    }
    case 'doubloonsAtRaidEnd':    return `${e.n >= 0 ? '+' : ''}${e.n} ⟡ at raid end`
    case 'noncritDmgMult':        return `Non-crit shots deal ${Math.round((1 - e.mult) * 100)}% less`
    case 'aimBlackout':           return 'Your aim bar goes dark in fits'
    case 'aimDecoys':             return `${e.n} false target${e.n === 1 ? '' : 's'} drift your aim bar`
    case 'confuse':               return `${Math.round(e.chance * 100)}% of your orders come out scrambled`
    case 'hideEnemyHp':           return `${Math.round(e.chance * 100)}% chance the enemy's HP is hidden`
    case 'hideEnemyCharges':      return `${Math.round(e.chance * 100)}% chance the enemy's loaded shots are hidden`
    case 'iceAffinity':           return `${Math.round(e.freezeChance * 100)}% freeze + ${Math.round((e.frozenDmgMult - 1) * 100)}% vs frozen`
    case 'fireAffinity':          return `${Math.round(e.burnChance * 100)}% burn, longer + hotter`
    case 'aimFog':                return 'Fog drifts over your aim bar'
    case 'playerStatusDuration':  return `Statuses on you last ${e.mult}x as long`
    case 'noCleanse':             return 'Nothing lifts a status off you'
    case 'healMult':              return e.mult <= 0 ? 'Nothing heals you' : e.mult < 1 ? `All healing ${pct(1 - e.mult)} weaker` : `All healing ${pct(e.mult - 1)} stronger`
    case 'aimSpeedMult':          return e.mult > 1 ? `Aim needle ${pct(e.mult - 1)} faster` : `Aim needle ${pct(1 - e.mult)} slower`
    case 'zoneSpeedMult':         return e.mult > 1 ? `Target band lurches ${pct(e.mult - 1)} faster` : `Target band ${pct(1 - e.mult)} steadier`
    case 'killStackDamage':       return `${pct(e.perKill)} damage per enemy sunk (max ${pct(e.maxBonus)})`
    case 'depthScaleDamage':      return `${pct(e.perDepth)} damage per depth (max ${pct(e.maxBonus)})`
    case 'critStreakDamage':      return `${pct(e.perStack)} damage per crit in a row (max ${e.maxStacks})`
    case 'counterFireChance':     return `${Math.round(e.chance * 100)}% to cancel their shot when you both fire`
    case 'counterBonus':          return `Counters fire +${Math.round(e.chanceBonus * 100)}% more, add ${e.bonusStack} Cannonade stack${e.bonusStack === 1 ? '' : 's'}${e.refund > 0 ? `, refund ${e.refund}` : ''}`
    case 'counterReflect':        return `A countered shot flings back ${Math.round(e.pct * 100)}% of their damage`
    case 'lifestealKillScale':    return `+${pct(e.perKill)} lifesteal per hull sunk (max ${pct(e.max)})`
    case 'depthScaleMitigation':  return `Take ${pct(e.perDepth)} less damage per depth (max ${pct(e.max)})`
    case 'maxHpMult':             return `+${Math.round((e.mult - 1) * 100)}% max HP`
    case 'maxHpPerDepth':         return `+${pct(e.perDepth)} max HP per depth (max ${pct(e.max)})`
    case 'maxHpPerKill':          return `+${pct(e.perKill)} max HP per hull sunk (max ${pct(e.max)})`
    case 'overhealPct':           return `Heals can overfill to +${Math.round(e.pct * 100)}% over max (this fight only)`
    case 'repairHealMult':        return `Repair kits heal +${Math.round((e.mult - 1) * 100)}% more`
    case 'statusOnHit':           return `${Math.round(e.chance * 100)}% on a landed hit to ${e.status} the enemy`
    case 'playerStartStatus':     return `Start each fight ${e.status}`
    case 'shieldPierce':          return `Your shots ignore ${Math.round(e.pct * 100)}% of enemy barriers`
    case 'stunOnHit':             return `${Math.round(e.chance * 100)}% on a hit to stun the enemy ${e.turns > 1 ? `${e.turns} turns` : 'a turn'}`
    case 'gripStacks':            return `Every ${e.hits} hits drags the enemy under for ${e.turns > 1 ? `${e.turns} turns` : 'a turn'}, crushing it for ${Math.round(e.crushPct * 100)}% of its max HP each turn`
    case 'guaranteedCritEvery':   return `Every ${e.n}${e.n === 1 ? 'st' : e.n === 2 ? 'nd' : e.n === 3 ? 'rd' : 'th'} landed shot is a guaranteed crit`
    case 'stealCharge':           return `${Math.round(e.chance * 100)}% on a hit to steal an enemy cannonball`
    case 'parryChance':           return `${Math.round(e.chance * 100)}% to parry a hit${e.reflectPct > 0 ? ` and reflect ${Math.round(e.reflectPct * 100)}%` : ''}`
    case 'aimClarity':            return e.reduce >= 1 ? `Immune to aim fog, blackout + decoys` : `Aim fog + blackout cut ${Math.round(e.reduce * 100)}%`
    case 'randomFightBuff':       return `Open each fight with a random blessing`
    case 'abilityRefundChance':   return `${Math.round(e.chance * 100)}% to NOT spend a crew ability on use`
    case 'enemyUltimateBoost':    return `Enemy ultimates hit ${Math.round((e.dmgMult - 1) * 100)}% harder + charge faster`
    case 'enemyChargeSteal':      return `Enemies steal your cannonballs (+${Math.round(e.bonus * 100)}%)`
    case 'enemyParry':            return `Enemies ${Math.round(e.chance * 100)}% to parry your shots`
    case 'enemyLifesteal':        return `Enemies heal ${Math.round(e.pct * 100)}% of the damage they deal you`
    case 'randomFightDebuff':     return `Start each fight under a random debuff`
    case 'flareStorm':            return `Flare barrages come faster and hit harder`
    case 'barrierRegrow':         return `Enemy barriers reknit each round`
  }
}

function pct(x: number): string {
  const sign = x >= 0 ? '+' : ''
  return `${sign}${Math.round(x * 100)}%`
}
