'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RARITY_TIERS } from '@/lib/variants'
import {
  ZONES, EXPEDITION_SHIP_STATS, ENEMIES, EXPEDITION_ITEMS, RUN_ITEMS,
  CORAL_RUN_EVENTS, CORAL_RUN_SHOP,
  applyVariantBoosts, computeTotalCrewStats, resolveRound, initCombatState, rollLootTable,
  type ZoneKey, type CombatAction, type Expedition, type CombatState,
  type NodeResult, type NodeType, type EventNodeDef, type ShopOption,
  type CombatRoundLog, type ZoneLoot, type RunBuff,
} from '@/lib/expeditions'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function pickEventForNode(zone: ZoneKey, nodeIndex: number, expeditionId: number): EventNodeDef {
  const pool = zone === 'coral_run' ? CORAL_RUN_EVENTS : CORAL_RUN_EVENTS
  const idx = (expeditionId * 997 + nodeIndex * 31) % pool.length
  return pool[idx]
}

function shopForZone(zone: ZoneKey): ShopOption[] {
  return zone === 'coral_run' ? CORAL_RUN_SHOP : CORAL_RUN_SHOP
}

function pickFightEnemy(zone: ZoneKey, nodeIndex: number, expeditionId: number): string {
  const pool = ZONES[zone].fightEnemyPool
  const idx = (expeditionId * 1009 + nodeIndex * 53) % pool.length
  return pool[idx]
}

// ── State hydration ───────────────────────────────────────────────────────────

export interface ExpeditionStateResponse {
  expedition: Expedition
  nodeType: NodeType
  currentEvent: EventNodeDef | null
  shopOptions: ShopOption[] | null
}

export async function getExpeditionState(
  expeditionId: number,
): Promise<ExpeditionStateResponse | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .single()

  if (!data) return { error: 'Expedition not found' }
  let exp = data as Expedition

  const zone = ZONES[exp.zone]
  const nodes = zone.nodes
  const nodeConfig = nodes[exp.current_node]

  if (!nodeConfig) {
    return { expedition: exp, nodeType: 'boss', currentEvent: null, shopOptions: null }
  }

  const nodeType = nodeConfig.type

  // Auto-init combat state when landing on a fight/boss node
  if ((nodeType === 'fight' || nodeType === 'boss') && !exp.combat_state) {
    const enemyId = nodeType === 'boss'
      ? zone.bossId
      : pickFightEnemy(exp.zone, exp.current_node, exp.id)

    const ship = EXPEDITION_SHIP_STATS[exp.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
    // Apply equipped item bonus to starting charges
    const cs = initCombatState(enemyId, exp.equipped_item)
    // Apply patched_hull item: +10 durability at run start is already handled in startExpedition

    await admin
      .from('expeditions')
      .update({ combat_state: cs })
      .eq('id', expeditionId)

    exp = { ...exp, combat_state: cs }
  }

  const currentEvent = nodeType === 'event'
    ? pickEventForNode(exp.zone, exp.current_node, exp.id)
    : null

  const shopOptions = nodeType === 'shop' ? shopForZone(exp.zone) : null

  return { expedition: exp, nodeType, currentEvent, shopOptions }
}

// ── Start expedition ──────────────────────────────────────────────────────────

export async function startExpedition(
  zone: ZoneKey,
  crewLoadout: Expedition['crew_loadout'],
  equippedItem: string | null,
): Promise<{ expeditionId: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const zoneConfig = ZONES[zone]

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, ship_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const shipTier = profile.ship_tier ?? 0
  if (shipTier < zoneConfig.requiredShipTier) {
    return { error: `Requires ${EXPEDITION_SHIP_STATS[zoneConfig.requiredShipTier]?.name ?? 'a higher tier ship'}` }
  }

  if ((profile.doubloons ?? 0) < zoneConfig.entryCost) {
    return { error: `Need ${zoneConfig.entryCost} ⟡ to enter` }
  }

  // No active expedition check
  const { data: active } = await admin
    .from('expeditions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (active) return { error: 'You already have an expedition in progress' }

  // Validate equipped item ownership
  if (equippedItem) {
    const { data: ownedItem } = await admin
      .from('expedition_items')
      .select('item_id')
      .eq('user_id', user.id)
      .eq('item_id', equippedItem)
      .maybeSingle()
    if (!ownedItem) return { error: 'You do not own that item' }
  }

  // Deduct entry cost
  const newDoubloons = profile.doubloons - zoneConfig.entryCost
  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -zoneConfig.entryCost,
      reason: `Expedition entry: ${zoneConfig.name}`,
    }),
  ])

  // Apply patched_hull bonus
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const startingDurability = ship.durability + (equippedItem === 'patched_hull' ? 10 : 0)
  const hullDamage = ship.durability - startingDurability // 0 normally, -10 for patched hull (impossible — hull_damage is damage taken, starts at 0)
  // hull_damage tracks damage taken, not current HP. So always start at 0.
  // patched_hull gives +10 effective HP by adding a run buff instead:
  const runBuffs: RunBuff[] = equippedItem === 'anchor_chain'
    ? [{ source: 'anchor_chain', effect: 'armor', value: 2 }]
    : equippedItem === 'patched_hull'
    ? [{ source: 'patched_hull', effect: 'durability', value: 10 }]
    : []

  const { data: expedition, error } = await admin
    .from('expeditions')
    .insert({
      user_id: user.id,
      zone,
      ship_tier: shipTier,
      crew_loadout: crewLoadout,
      expedition_date: today(),
      status: 'active',
      current_node: 0,
      hull_damage: 0,
      events: [],
      equipped_item: equippedItem,
      run_buffs: runBuffs,
      combat_state: null,
      loot: null,
    })
    .select('id')
    .single()

  if (error || !expedition) return { error: 'Failed to start expedition' }

  return { expeditionId: expedition.id }
}

// ── Combat ────────────────────────────────────────────────────────────────────

export interface CombatActionResult {
  roundLog: CombatRoundLog
  combatOver: boolean
  playerWon: boolean
  expeditionFailed: boolean
  zoneComplete: boolean
  newDurability: number
  maxDurability: number
  newCombatState: CombatState | null
  goldEarned: number
  runItemDropped: string | null    // applied this fight, not kept
  runItemBuff: RunBuff | null      // buff from run item, if any
  permItemDropped: string | null   // added to inventory
}

export async function takeCombatAction(
  expeditionId: number,
  action: CombatAction,
): Promise<CombatActionResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!['reload', 'fire', 'fire_heavy', 'defend'].includes(action)) return { error: 'Invalid action' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return { error: 'Expedition not found' }
  const exp = data as Expedition

  if (!exp.combat_state) return { error: 'No active combat' }

  const ship = EXPEDITION_SHIP_STATS[exp.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
  const crew = computeTotalCrewStats(exp.crew_loadout ?? [])
  const runBuffs = exp.run_buffs ?? []

  const durabilityBuff = runBuffs.filter(b => b.effect === 'durability').reduce((s, b) => s + b.value, 0)
  const maxDurability = ship.durability + durabilityBuff
  const currentDurability = maxDurability - (exp.hull_damage ?? 0)

  const resolution = resolveRound(exp.combat_state, action, crew, ship, currentDurability, runBuffs)

  let newHullDamage = maxDurability - resolution.newDurability
  const combatOver = resolution.combatOver
  const playerWon = resolution.playerWon
  const expeditionFailed = combatOver && !playerWon

  let zoneComplete = false
  let newCurrentNode = exp.current_node
  let newStatus: string = exp.status
  let newCombatState: CombatState | null = resolution.newState
  let goldEarned = 0
  let runItemDropped: string | null = null
  let runItemBuff: RunBuff | null = null
  let permItemDropped: string | null = null

  const zone = ZONES[exp.zone]
  const nodeResults: NodeResult[] = [...(exp.events ?? [])]

  if (combatOver) {
    const nodeType = zone.nodes[exp.current_node]?.type ?? 'fight'
    nodeResults.push({
      nodeIndex: exp.current_node,
      type: nodeType,
      outcome: playerWon ? 'win' : 'lose',
    })

    if (expeditionFailed) {
      newStatus = 'failed'
      newCombatState = null
    } else {
      newCurrentNode = exp.current_node + 1
      newCombatState = null
      const defeatedEnemy = ENEMIES[exp.combat_state!.enemyId]
      goldEarned = defeatedEnemy?.goldReward ?? 0

      // Roll item drop for elite enemies
      if (defeatedEnemy?.elite && defeatedEnemy.lootTable) {
        const droppedId = rollLootTable(defeatedEnemy.lootTable)
        if (droppedId) {
          if (defeatedEnemy.lootTable.type === 'run') {
            // Apply immediately to this run — not kept
            runItemDropped = droppedId
            const runItem = RUN_ITEMS[droppedId]
            if (runItem) {
              const effect = runItem.effect
              if (effect.type === 'heal') {
                const healed = Math.min(effect.value ?? 0, newHullDamage)
                newHullDamage = Math.max(0, newHullDamage - healed)
              } else if (effect.type === 'buff' && effect.buff) {
                runItemBuff = effect.buff
              }
            }
          } else {
            // Permanent — add to player's inventory
            permItemDropped = droppedId
            const { data: existingItem } = await admin
              .from('expedition_items')
              .select('id, quantity')
              .eq('user_id', user.id)
              .eq('item_id', permItemDropped)
              .maybeSingle()
            if (existingItem) {
              await admin.from('expedition_items')
                .update({ quantity: existingItem.quantity + 1 })
                .eq('id', existingItem.id)
            } else {
              await admin.from('expedition_items')
                .insert({ user_id: user.id, item_id: permItemDropped, quantity: 1 })
            }
          }
        }
      }

      // Check zone complete (advanced past last node)
      if (newCurrentNode >= zone.nodes.length) {
        zoneComplete = true
        // Don't set completed yet — wait for claimZoneReward
      } else {
        // Auto-init combat for next fight/boss node
        const nextNodeType = zone.nodes[newCurrentNode]?.type
        if (nextNodeType === 'fight' || nextNodeType === 'boss') {
          const enemyId = nextNodeType === 'boss'
            ? zone.bossId
            : pickFightEnemy(exp.zone, newCurrentNode, exp.id)
          newCombatState = initCombatState(enemyId, exp.equipped_item)
        }
      }
    }
  }

  const update: Record<string, unknown> = {
    hull_damage: newHullDamage,
    combat_state: newCombatState,
    events: nodeResults,
  }
  if (combatOver) {
    update.current_node = newCurrentNode
    if (goldEarned > 0) update.run_gold = (exp.run_gold ?? 0) + goldEarned
    if (runItemBuff) update.run_buffs = [...(exp.run_buffs ?? []), runItemBuff]
    if (expeditionFailed) {
      update.status = 'failed'
      update.completed_at = new Date().toISOString()
    }
  }

  await admin.from('expeditions').update(update).eq('id', expeditionId)

  return {
    roundLog: resolution.roundLog,
    combatOver,
    playerWon,
    expeditionFailed,
    zoneComplete,
    newDurability: maxDurability - newHullDamage,
    maxDurability,
    newCombatState,
    goldEarned,
    runItemDropped,
    runItemBuff,
    permItemDropped,
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface EventChoiceResult {
  effectType: string
  value: number
  newCurrentNode: number
  zoneComplete: boolean
  newDurability?: number
  maxDurability?: number
  goldBonus?: number
  buff?: RunBuff
  newCombatState: CombatState | null
}

export async function makeEventChoice(
  expeditionId: number,
  choiceIndex: number,
): Promise<EventChoiceResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return { error: 'Expedition not found' }
  const exp = data as Expedition

  const zone = ZONES[exp.zone]
  const nodeType = zone.nodes[exp.current_node]?.type
  if (nodeType !== 'event') return { error: 'Not on an event node' }

  const event = pickEventForNode(exp.zone, exp.current_node, exp.id)
  const choice = event.choices[choiceIndex]
  if (!choice) return { error: 'Invalid choice' }

  const ship = EXPEDITION_SHIP_STATS[exp.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
  const runBuffs = exp.run_buffs ?? []
  const durabilityBuff = runBuffs.filter(b => b.effect === 'durability').reduce((s, b) => s + b.value, 0)
  const maxDurability = ship.durability + durabilityBuff
  const currentDurability = maxDurability - (exp.hull_damage ?? 0)

  const effect = choice.effect
  let newHullDamage = exp.hull_damage ?? 0
  let newRunBuffs = [...runBuffs]
  let goldBonus = 0

  if (effect.type === 'heal') {
    const healed = Math.min(effect.value ?? 0, exp.hull_damage ?? 0)
    newHullDamage = Math.max(0, newHullDamage - healed)
  } else if (effect.type === 'damage') {
    newHullDamage = Math.min(maxDurability, newHullDamage + (effect.value ?? 0))
  } else if (effect.type === 'buff' && effect.buff) {
    newRunBuffs.push(effect.buff)
  } else if (effect.type === 'gold') {
    goldBonus = effect.value ?? 0
  }

  const nodeResults: NodeResult[] = [
    ...(exp.events ?? []),
    { nodeIndex: exp.current_node, type: 'event', outcome: 'event', details: { eventId: event.id, choiceIndex } },
  ]

  const newCurrentNode = exp.current_node + 1
  const zoneComplete = newCurrentNode >= zone.nodes.length

  let newCombatState: CombatState | null = null
  if (!zoneComplete) {
    const nextNodeType = zone.nodes[newCurrentNode]?.type
    if (nextNodeType === 'fight' || nextNodeType === 'boss') {
      const enemyId = nextNodeType === 'boss'
        ? zone.bossId
        : pickFightEnemy(exp.zone, newCurrentNode, exp.id)
      newCombatState = initCombatState(enemyId, exp.equipped_item)
    }
  }

  const update: Record<string, unknown> = {
    hull_damage: newHullDamage,
    run_buffs: newRunBuffs,
    events: nodeResults,
    current_node: newCurrentNode,
    combat_state: newCombatState,
  }
  if (goldBonus > 0) update.run_gold = (exp.run_gold ?? 0) + goldBonus

  await admin.from('expeditions').update(update).eq('id', expeditionId)

  return {
    effectType: effect.type,
    value: effect.value ?? 0,
    newCurrentNode,
    zoneComplete,
    newDurability: maxDurability - newHullDamage,
    maxDurability,
    goldBonus,
    buff: effect.buff,
    newCombatState,
  }
}

// ── Shop ──────────────────────────────────────────────────────────────────────

export async function buyShopItem(
  expeditionId: number,
  shopItemId: string,
): Promise<{ ok: true; newDurability?: number; maxDurability?: number; buff?: RunBuff } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return { error: 'Expedition not found' }
  const exp = data as Expedition

  const zone = ZONES[exp.zone]
  const nodeType = zone.nodes[exp.current_node]?.type
  if (nodeType !== 'shop') return { error: 'Not at shop' }

  const shopItems = shopForZone(exp.zone)
  const item = shopItems.find(s => s.id === shopItemId)
  if (!item) return { error: 'Item not found' }

  const currentGold = exp.run_gold ?? 0
  if (currentGold < item.cost) return { error: 'Not enough gold' }

  const ship = EXPEDITION_SHIP_STATS[exp.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
  const runBuffs = exp.run_buffs ?? []
  const durabilityBuff = runBuffs.filter(b => b.effect === 'durability').reduce((s, b) => s + b.value, 0)
  const maxDurability = ship.durability + durabilityBuff
  let newHullDamage = exp.hull_damage ?? 0
  let newRunBuffs = [...runBuffs]

  const effect = item.effect
  if (effect.type === 'heal') {
    newHullDamage = Math.max(0, newHullDamage - (effect.value ?? 0))
  } else if (effect.type === 'buff' && effect.buff) {
    newRunBuffs.push(effect.buff)
  }

  await admin.from('expeditions').update({
    hull_damage: newHullDamage,
    run_buffs: newRunBuffs,
    run_gold: currentGold - item.cost,
  }).eq('id', expeditionId)

  return { ok: true, newDurability: maxDurability - newHullDamage, maxDurability, buff: effect.buff }
}

export async function leaveShop(
  expeditionId: number,
): Promise<{ newCurrentNode: number; zoneComplete: boolean; newCombatState: CombatState | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return { error: 'Expedition not found' }
  const exp = data as Expedition

  const zone = ZONES[exp.zone]
  if (zone.nodes[exp.current_node]?.type !== 'shop') return { error: 'Not at shop' }

  const nodeResults: NodeResult[] = [
    ...(exp.events ?? []),
    { nodeIndex: exp.current_node, type: 'shop', outcome: 'shop' },
  ]

  const newCurrentNode = exp.current_node + 1
  const zoneComplete = newCurrentNode >= zone.nodes.length

  let newCombatState: CombatState | null = null
  if (!zoneComplete) {
    const nextNodeType = zone.nodes[newCurrentNode]?.type
    if (nextNodeType === 'fight' || nextNodeType === 'boss') {
      const enemyId = nextNodeType === 'boss'
        ? zone.bossId
        : pickFightEnemy(exp.zone, newCurrentNode, exp.id)
      newCombatState = initCombatState(enemyId, exp.equipped_item)
    }
  }

  await admin.from('expeditions').update({
    current_node: newCurrentNode,
    events: nodeResults,
    combat_state: newCombatState,
  }).eq('id', expeditionId)

  return { newCurrentNode, zoneComplete, newCombatState }
}

// ── Zone reward ───────────────────────────────────────────────────────────────

export async function claimZoneReward(
  expeditionId: number,
): Promise<ZoneLoot | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return { error: 'Expedition not found' }
  const exp = data as Expedition

  const zone = ZONES[exp.zone]
  // Must be past all nodes
  if (exp.current_node < zone.nodes.length) return { error: 'Zone not complete' }

  const baseDoubloons = zone.baseDoubloons
  // Small variance: ±20%
  const variance = 0.8 + Math.random() * 0.4
  const doubloons = Math.floor(baseDoubloons * variance)

  // Item drop
  let itemDropped: string | null = null
  if (zone.itemDropPool.length > 0 && Math.random() < zone.itemDropChance) {
    const pool = zone.itemDropPool
    itemDropped = pool[Math.floor(Math.random() * pool.length)]

    // Grant item to player (upsert — increment quantity if owned)
    const { data: existingItem } = await admin
      .from('expedition_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('item_id', itemDropped)
      .maybeSingle()

    if (existingItem) {
      await admin.from('expedition_items')
        .update({ quantity: existingItem.quantity + 1 })
        .eq('id', existingItem.id)
    } else {
      await admin.from('expedition_items')
        .insert({ user_id: user.id, item_id: itemDropped, quantity: 1 })
    }
  }

  const loot: ZoneLoot = { doubloons, itemDropped }

  const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
  const newDoubloons = (profile?.doubloons ?? 0) + doubloons

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloons,
      reason: `Expedition reward: ${zone.name}`,
    }),
    admin.from('expeditions').update({
      status: 'completed',
      loot,
      completed_at: new Date().toISOString(),
    }).eq('id', expeditionId),
  ])

  return loot
}

// ── Collection for crew picker ────────────────────────────────────────────────

export async function getCollectionForCrew(): Promise<Array<{
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  borderStyle: string
  artEffect: string
  variantName: string
  dropWeight: number
  rarity: string
  power: number
  dodge: number
  fortune: number
}>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune))')
    .eq('user_id', user.id)

  if (!data) return []

  const seen = new Set<number>()
  type Row = {
    id: number; card_variant_id: number
    card_variants: { id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; cards: { id: number; name: string; slug: string; filename: string; tier: number; power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number } }
  }

  const result = []
  for (const row of (data as unknown as Row[])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)
    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t => t.variants.includes(v.variant_name))?.name ?? 'Common'
    const base = { power: card.power, dodge: card.dodge, fortune: card.fortune }
    const mythic = { power: card.mythic_power, dodge: card.mythic_dodge, fortune: card.mythic_fortune }
    const stats = applyVariantBoosts(base, v.variant_name, mythic)
    result.push({
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      borderStyle: v.border_style,
      artEffect: v.art_effect,
      variantName: v.variant_name,
      dropWeight: v.drop_weight,
      rarity,
      power: stats.power,
      dodge: stats.dodge,
      fortune: stats.fortune,
    })
  }

  result.sort((a, b) => (b.power + b.dodge + b.fortune) - (a.power + a.dodge + a.fortune))
  return result
}

export async function saveCrew(variantIds: number[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ saved_crew: variantIds }).eq('id', user.id)
}

export async function getUserItems(): Promise<Array<{ itemId: string; quantity: number }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('expedition_items')
    .select('item_id, quantity')
    .eq('user_id', user.id)

  return (data ?? []).map((r: { item_id: string; quantity: number }) => ({ itemId: r.item_id, quantity: r.quantity }))
}

export async function abandonExpedition(
  expeditionId: number,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('id')
    .single()

  if (!data) return { error: 'Expedition not found or already ended' }
  return { ok: true }
}

export async function getTodayExpeditions(): Promise<Expedition[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(10)

  return (data ?? []) as Expedition[]
}
