/**
 * Pure-CSS ambient layer for the Shallows zone. Adds drifting surface caustics
 * and angled sunlight godrays on top of the static background. No JS animation
 * loop — everything runs on CSS keyframes so we don't fight the dial's render
 * budget. Intentionally avoids rising bubbles since those are reserved for the
 * fishing event particle effects.
 */
export default function ShallowsAmbient() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Caustics — soft light blobs drifting across the upper water */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: '-10%', right: '-10%',
          height: '45%',
          mixBlendMode: 'screen',
          opacity: 0.55,
          backgroundImage: [
            'radial-gradient(120px 60px at 18% 30%, rgba(255,255,255,0.32), transparent 70%)',
            'radial-gradient(160px 70px at 42% 18%, rgba(190,235,255,0.28), transparent 70%)',
            'radial-gradient(90px  50px at 70% 38%, rgba(255,255,255,0.30), transparent 70%)',
            'radial-gradient(140px 60px at 88% 22%, rgba(220,245,255,0.26), transparent 70%)',
            'radial-gradient(110px 55px at 26% 60%, rgba(255,255,255,0.22), transparent 70%)',
            'radial-gradient(130px 60px at 60% 70%, rgba(210,240,255,0.20), transparent 70%)',
          ].join(','),
          animation: 'shallowsCaustics 14s ease-in-out infinite alternate',
        }}
      />

      {/* Godrays — diagonal sunlight shafts piercing down from the surface.
         Long thin gradients angled slightly off-vertical, each with its own
         flicker so they breathe independently. */}
      <Godray left="6%"  width={32}  angle={-8}  duration={18}  delay={0}   peak={0.22} />
      <Godray left="22%" width={48}  angle={-4}  duration={22}  delay={5}   peak={0.18} />
      <Godray left="38%" width={28}  angle={3}   duration={20}  delay={2}   peak={0.24} />
      <Godray left="54%" width={56}  angle={-2}  duration={24}  delay={8}   peak={0.16} />
      <Godray left="72%" width={36}  angle={6}   duration={19}  delay={3.5} peak={0.20} />
      <Godray left="88%" width={26}  angle={-6}  duration={21}  delay={6}   peak={0.20} />
    </div>
  )
}

interface GodrayProps {
  left: string
  width: number
  angle: number
  duration: number
  delay: number
  peak: number
}

function Godray({ left, width, angle, duration, delay, peak }: GodrayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '-10%',
        left,
        width,
        height: '70%',
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'top center',
        mixBlendMode: 'screen',
        opacity: 0,
        background:
          'linear-gradient(to bottom, rgba(255,250,230,0.85) 0%, rgba(255,245,210,0.45) 35%, rgba(255,245,210,0.0) 100%)',
        filter: 'blur(6px)',
        animation: `shallowsGodray ${duration}s ease-in-out ${delay}s infinite`,
        ['--ray-peak' as string]: peak,
      } as React.CSSProperties}
    />
  )
}
