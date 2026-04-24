import { createClient } from '@/lib/supabase/server'
import DemoPackOpener from './DemoPackOpener'
import type { CardVariant } from '@/lib/types'

export default async function DemoPage() {
  const supabase = await createClient()
  const { data: variants } = await supabase
    .from('card_variants')
    .select('id, card_id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, zone)')

  return (
    <main className="min-h-screen bg-black px-6 py-14">
      <div className="text-center mb-12">
        <p className="sg-eyebrow mb-4">UI Prototype</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] leading-[0.92] tracking-[-0.01em] mb-8"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          Pack Opening.
        </h1>
        <div className="flex flex-wrap justify-center gap-6 font-karla font-300 text-sm">
          <span className="text-[#a0a09a]">Common</span>
          <span className="text-[#a0a09a]">·</span>
          <span className="text-[#f0c040]">✦ Rare</span>
          <span className="text-[#a0a09a]">·</span>
          <span className="text-[#a78bfa]">✦✦ Epic</span>
          <span className="text-[#a0a09a]">·</span>
          <span className="bg-clip-text text-transparent bg-linear-to-r from-yellow-300 via-pink-400 to-purple-400">✦✦✦ Legendary</span>
        </div>
      </div>
      <DemoPackOpener variants={(variants ?? []) as unknown as CardVariant[]} />
    </main>
  )
}
