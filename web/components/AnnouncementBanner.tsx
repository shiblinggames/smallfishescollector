'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Announcement {
  id: string
  message: string
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(false)

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

  function dismiss() {
    if (!announcement) return
    localStorage.setItem(`announcement_dismissed_${announcement.id}`, '1')
    setVisible(false)
  }

  if (!visible || !announcement) return null

  return (
    <div style={{
      background: 'rgba(240,192,64,0.10)',
      borderBottom: '1px solid rgba(240,192,64,0.22)',
      padding: '0.55rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      position: 'relative',
      zIndex: 40,
    }}>
      <p className="font-karla font-500 text-center flex-1" style={{ fontSize: '0.72rem', color: '#f0ede8', lineHeight: 1.4 }}>
        {announcement.message}
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6a6764', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0, padding: '0 0.25rem' }}
      >
        ×
      </button>
    </div>
  )
}
