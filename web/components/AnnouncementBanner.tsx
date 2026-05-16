'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Announcement {
  id: string
  message: string
}

// How long the banner stays up before it fades itself out. Long enough
// to read a sentence or two; a manual close (×) dismisses it instantly.
// Either path persists the dismissal so it doesn't re-pop on every nav.
const AUTO_DISMISS_MS = 11000
const FADE_MS = 400

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('announcements')
      .select('id, message')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (localStorage.getItem(`announcement_dismissed_${data.id}`)) return
        setAnnouncement(data)
        setVisible(true)
      })
  }, [])

  // Auto-dismiss after a delay. Treated the same as a manual close so the
  // banner doesn't reappear on the next page load.
  useEffect(() => {
    if (!visible || !announcement) return
    const t = setTimeout(() => dismiss(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, announcement])

  function dismiss() {
    if (!announcement) return
    localStorage.setItem(`announcement_dismissed_${announcement.id}`, '1')
    // Fade out, then unmount, so it doesn't snap away.
    setLeaving(true)
    setTimeout(() => setVisible(false), FADE_MS)
  }

  if (!visible || !announcement) return null

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(240,192,64,0.30), rgba(240,192,64,0.18))',
      borderBottom: '1px solid rgba(240,192,64,0.5)',
      padding: '0.7rem 1rem 0.7rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.85rem',
      position: 'relative',
      zIndex: 40,
      opacity: leaving ? 0 : 1,
      transform: leaving ? 'translateY(-6px)' : 'translateY(0)',
      transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    }}>
      <p className="font-karla font-600 text-center flex-1" style={{
        fontSize: '0.85rem',
        color: '#fff7e0',
        lineHeight: 1.45,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {announcement.message}
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="font-karla font-700"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.32)',
          border: '1px solid rgba(255,247,224,0.6)',
          color: '#fff7e0',
          fontSize: '0.95rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
