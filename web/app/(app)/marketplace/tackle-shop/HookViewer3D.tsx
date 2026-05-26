'use client'

export default function HookViewer3D({ imageUrl, color, height = 220, glowClass }: { imageUrl?: string; color: string; tier?: number; modelUrl?: string; height?: number; glowClass?: string }) {
  return (
    <div style={{
      width: '100%', height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className={glowClass}
          style={{
            maxHeight: height * 0.85, maxWidth: '70%', objectFit: 'contain',
            // The themed glow classes drive their own drop-shadow filter via
            // CSS animation, so the static color shadow would compete with
            // them. Only apply it when there's no themed aura.
            ...(glowClass ? {} : { filter: `drop-shadow(0 0 18px ${color}55)` }),
          }}
        />
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${color}18`, border: `1px solid ${color}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v9"/>
            <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
            <circle cx="12" cy="3" r="1.2" fill={color} stroke="none"/>
          </svg>
        </div>
      )}
    </div>
  )
}
