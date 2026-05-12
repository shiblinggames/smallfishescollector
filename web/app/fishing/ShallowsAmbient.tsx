/**
 * Pure-CSS ambient layer for the Shallows zone. Adds drifting surface caustics
 * and rising bubbles on top of the static background. No JS animation loop —
 * everything runs on CSS keyframes so we don't fight the dial's render budget.
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

      {/* Bubbles — baked positions/durations so it's deterministic and cheap */}
      <Bubble left="8%"  size={5}  duration={8}  delay={0}   drift={6}  opacity={0.55} />
      <Bubble left="18%" size={4}  duration={10} delay={3.2} drift={-8} opacity={0.45} />
      <Bubble left="28%" size={7}  duration={9}  delay={1.4} drift={5}  opacity={0.50} />
      <Bubble left="40%" size={3}  duration={7}  delay={5.0} drift={-4} opacity={0.55} />
      <Bubble left="54%" size={6}  duration={11} delay={2.6} drift={7}  opacity={0.45} />
      <Bubble left="66%" size={4}  duration={9}  delay={6.8} drift={-6} opacity={0.50} />
      <Bubble left="78%" size={8}  duration={10} delay={0.8} drift={5}  opacity={0.40} />
      <Bubble left="88%" size={4}  duration={8}  delay={4.4} drift={-5} opacity={0.55} />
    </div>
  )
}

interface BubbleProps {
  left: string
  size: number
  duration: number
  delay: number
  drift: number
  opacity: number
}

function Bubble({ left, size, duration, delay, drift, opacity }: BubbleProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: -20,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(220,240,255,0.55) 45%, rgba(180,220,240,0.0) 75%)',
        boxShadow: '0 0 4px rgba(255,255,255,0.35)',
        opacity: 0,
        animation: `shallowsBubble ${duration}s linear ${delay}s infinite`,
        ['--bubble-drift' as string]: `${drift}px`,
        ['--bubble-peak' as string]: opacity,
      } as React.CSSProperties}
    />
  )
}
