export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  weights: { shallows: number; openWaters: number; deep: number; abyss: number }
}

export const HOOKS: HookDef[] = [
  {
    tier: 0, name: 'Rusty Hook', cost: 0,
    description: 'A worn hook from the bottom of the tackle box.',
    weights: { shallows: 0.520, openWaters: 0.330, deep: 0.148, abyss: 0.002 },
  },
  {
    tier: 1, name: 'Bent Hook', cost: 150,
    description: 'Slightly bent, but it still catches fish.',
    weights: { shallows: 0.500, openWaters: 0.327, deep: 0.170, abyss: 0.003 },
  },
  {
    tier: 2, name: 'Iron Hook', cost: 400,
    description: 'Solid iron. Reaches a bit deeper.',
    weights: { shallows: 0.480, openWaters: 0.324, deep: 0.192, abyss: 0.004 },
  },
  {
    tier: 3, name: 'Steel Hook', cost: 1000,
    description: 'Tempered steel. The deep waters are within reach.',
    weights: { shallows: 0.460, openWaters: 0.320, deep: 0.215, abyss: 0.005 },
  },
  {
    tier: 4, name: 'Gold Hook', cost: 2500,
    description: "Polished gold. Fish can't resist the shine.",
    weights: { shallows: 0.440, openWaters: 0.318, deep: 0.235, abyss: 0.007 },
  },
  {
    tier: 5, name: 'Enchanted Hook', cost: 6000,
    description: 'Glows faintly. Something stirs in the deep.',
    weights: { shallows: 0.410, openWaters: 0.312, deep: 0.269, abyss: 0.009 },
  },
  {
    tier: 6, name: 'Legendary Hook', cost: 18000,
    description: 'Said to have been lost at sea — and returned.',
    weights: { shallows: 0.380, openWaters: 0.310, deep: 0.300, abyss: 0.010 },
  },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}
