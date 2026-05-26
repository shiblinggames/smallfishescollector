'use client'

export default function ShipViewer3D({ imageUrl, color, height = 220 }: { imageUrl?: string; color: string; height?: number }) {
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
          style={{ maxHeight: height * 0.85, maxWidth: '70%', objectFit: 'contain', filter: `drop-shadow(0 0 18px ${color}55)` }}
        />
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${color}18`, border: `1px solid ${color}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 16 C4 20 20 20 22 16"/>
            <path d="M4 16 L6 12 L18 12 L20 16"/>
            <line x1="12" y1="12" x2="12" y2="5"/>
            <path d="M12 5 L17 10 L12 12"/>
          </svg>
        </div>
      )}
    </div>
  )
}
