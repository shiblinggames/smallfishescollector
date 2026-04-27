export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  rollBonus: number
  modelUrl?: string
}

export const HOOKS: HookDef[] = [
  { tier: 0, name: 'Rusty Hook',     cost: 0,     description: 'A worn hook from the bottom of the tackle box.',    color: '#a07858', rollBonus: 0,  modelUrl: '/models/hooks/rusty-hook.glb' },
  { tier: 1, name: 'Bent Hook',      cost: 150,   description: 'Slightly bent, but it still catches fish.',          color: '#9ca3af', rollBonus: 3,  modelUrl: '/models/hooks/bent-hook.glb' },
  { tier: 2, name: 'Iron Hook',      cost: 400,   description: 'Solid iron. Reaches a bit deeper.',                  color: '#60a5fa', rollBonus: 6,  modelUrl: '/models/hooks/iron-hook.glb' },
  { tier: 3, name: 'Steel Hook',     cost: 1000,  description: 'Tempered steel. The deep waters are within reach.',  color: '#4ade80', rollBonus: 9,  modelUrl: '/models/hooks/steel-hook.glb' },
  { tier: 4, name: 'Gold Hook',      cost: 2500,  description: "Polished gold. Fish can't resist the shine.",        color: '#f0c040', rollBonus: 12, modelUrl: '/models/hooks/gold-hook.glb' },
  { tier: 5, name: 'Enchanted Hook', cost: 6000,  description: 'Glows faintly. Something stirs in the deep.',       color: '#a78bfa', rollBonus: 15, modelUrl: '/models/hooks/enchanted-hook.glb' },
  { tier: 6, name: 'Legendary Hook', cost: 18000, description: 'Said to have been lost at sea — and returned.',     color: '#ff6b35', rollBonus: 18, modelUrl: '/models/hooks/legendary-hook.glb' },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}
