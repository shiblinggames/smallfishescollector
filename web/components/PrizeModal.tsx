'use client'

interface Props {
  cardName: string
  variantName: string
  prizeCode: string
  onClose: () => void
}

export default function PrizeModal({ cardName, variantName, prizeCode, onClose }: Props) {
  function copyCode() {
    navigator.clipboard.writeText(prizeCode)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
         style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm sg-card p-8 text-center space-y-6 relative"
           style={{ border: '1px solid rgba(240,192,64,0.4)', boxShadow: '0 0 60px rgba(240,192,64,0.15)' }}>

        <div>
          <p className="sg-eyebrow mb-3">You Won</p>
          <h2 className="font-cinzel font-700 text-[#f0c040] leading-tight mb-2"
              style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
            ✦ Special Prize ✦
          </h2>
          <p className="font-karla font-300 text-[#8a8880] text-sm leading-relaxed">
            You pulled a <span className="text-[#f0ede8] font-500">{variantName} {cardName}</span> — one of the rarest cards in the game.
          </p>
        </div>

        <div style={{ background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.25)' }}
             className="px-4 py-5 space-y-2">
          <p className="sg-eyebrow text-[0.6rem]">Your Prize Code</p>
          <p className="font-cinzel font-700 text-[#f0c040] tracking-[0.18em] text-lg select-all">
            {prizeCode}
          </p>
          <button onClick={copyCode}
                  className="font-karla font-600 text-[0.65rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors">
            Copy Code
          </button>
        </div>

        <p className="font-karla font-300 text-[#8a8880] text-sm leading-relaxed">
          Reach out to us at{' '}
          <a href="mailto:hello@shiblinggames.com"
             className="text-[#f0c040] hover:text-[#ffd966] transition-colors">
            hello@shiblinggames.com
          </a>{' '}
          with this code to claim your prize.
        </p>

        <button onClick={onClose} className="btn-ghost w-full">
          Back to Pack
        </button>
      </div>
    </div>
  )
}
