'use client'

// Player mailbox. Renders the envelope icon (with unread pip) AND the
// inbox modal it opens. Single self-contained component so Nav.tsx only
// has to pass in the latest unread count it already polls — open state,
// fetch on open, mark-read on expand, and claim all live here.
//
// Mail is broadcast-only for v1 (every active row in mail_messages is
// visible to every authenticated player). Admin compose happens
// service-role-side; the inbox just renders + claims.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from './PopupShell'
import {
  getInbox,
  markMailRead,
  markAllMailRead,
  claimMailAttachment,
} from '@/app/actions/mail'
import type { MailMessage } from '@/lib/mailTypes'

const ACCENT = '#f0c040'         // gold, parchment-y "letter from the captain"
const ACCENT_DIM = '#caa540'
const UNREAD_PIP = '#e07c7c'     // soft red so it reads as a notification

// Coarse relative timestamp. Tightened for mail (we care about the last
// few hours) — falls back to a calendar date past a week.
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function MailInbox({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnreadCount)
  const [inbox, setInbox] = useState<MailMessage[] | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Keep the pip in sync with whatever the Nav poll feeds us. Without this,
  // a fresh fetchBadge() pull in Nav wouldn't reach our local state.
  useEffect(() => { setUnread(initialUnreadCount) }, [initialUnreadCount])

  async function openInbox() {
    setOpen(true)
    if (!inbox) setLoading(true)
    const result = await getInbox()
    setInbox(result.messages)
    setUnread(result.unreadCount)
    setLoading(false)
  }

  async function handleExpand(msg: MailMessage) {
    const willOpen = expandedId !== msg.id
    setExpandedId(willOpen ? msg.id : null)
    // Mark read on first open of a previously-unread row. Optimistic local
    // patch + fire-and-forget server upsert; mailbox refresh on next open
    // would corrects any drift if the upsert failed.
    if (willOpen && !msg.readAt) {
      setInbox(prev => prev?.map(m =>
        m.id === msg.id ? { ...m, readAt: new Date().toISOString() } : m
      ) ?? null)
      setUnread(n => Math.max(0, n - 1))
      void markMailRead(msg.id)
    }
  }

  async function handleClaim(msg: MailMessage) {
    if (claimingId) return
    setClaimingId(msg.id)
    const result = await claimMailAttachment(msg.id)
    setClaimingId(null)
    if (result.ok) {
      setInbox(prev => prev?.map(m =>
        m.id === msg.id ? { ...m, claimedAt: new Date().toISOString() } : m
      ) ?? null)
      // Patch the Nav currency widgets — same pattern other claim paths use.
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: result.newGems }))
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
    }
  }

  async function handleMarkAllRead() {
    if (unread === 0) return
    const now = new Date().toISOString()
    setInbox(prev => prev?.map(m => ({ ...m, readAt: m.readAt ?? now })) ?? null)
    setUnread(0)
    void markAllMailRead()
  }

  return (
    <>
      <button
        onClick={openInbox}
        aria-label={unread > 0 ? `Mail — ${unread} unread` : 'Mail'}
        className="relative flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 36, height: 36, padding: 0,
          background: 'transparent',
          border: 'none', cursor: 'pointer',
          color: unread > 0 ? ACCENT : '#a0a09a',
        }}
      >
        {/* Idle envelope breathes gently when there's unread mail — slow
            scale loop with a paired soft gold halo behind. Subtle enough
            to stay polite next to the currency widgets but lively enough
            that a returning player notices it before opening the menu. */}
        <motion.div
          aria-hidden
          animate={unread > 0 ? { opacity: [0.35, 0.7, 0.35], scale: [0.85, 1.1, 0.85] } : { opacity: 0 }}
          transition={unread > 0 ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
          style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 65%)`,
            pointerEvents: 'none',
          }}
        />
        <motion.svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
          animate={unread > 0 ? { scale: [1, 1.12, 1], y: [0, -1, 0] } : { scale: 1, y: 0 }}
          transition={unread > 0 ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <path d="M3 7l9 6 9-6"/>
        </motion.svg>
        {unread > 0 && (
          <motion.span
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 15, height: 15, padding: '0 4px',
              borderRadius: 999,
              background: UNREAD_PIP,
              color: '#1a0606',
              fontSize: '0.55rem',
              fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
              boxShadow: `0 0 6px ${UNREAD_PIP}88, 0 1px 3px rgba(0,0,0,0.55)`,
              zIndex: 2,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      <PopupShell open={open} onClose={() => setOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 440,
            background: 'linear-gradient(180deg, #1a1408 0%, #0a0807 100%)',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 18,
            boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 24px ${ACCENT}22`,
            padding: '1rem 1rem 1.1rem',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            paddingBottom: '0.75rem',
            borderBottom: `1px solid ${ACCENT}22`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${ACCENT}1a`,
              border: `1px solid ${ACCENT}55`,
              color: ACCENT,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2"/>
                <path d="M3 7l9 6 9-6"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.18em', color: `${ACCENT_DIM}cc` }}>
                Captain&apos;s
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0e8d0', lineHeight: 1.1, marginTop: 1 }}>
                Mailbox
              </p>
            </div>
            <button
              onClick={handleMarkAllRead}
              disabled={unread === 0}
              className="font-karla font-700 uppercase"
              style={{
                fontSize: '0.55rem', letterSpacing: '0.1em',
                color: unread === 0 ? 'rgba(255,255,255,0.25)' : ACCENT,
                background: 'transparent',
                border: `1px solid ${unread === 0 ? 'rgba(255,255,255,0.1)' : ACCENT + '55'}`,
                borderRadius: 8,
                padding: '0.32rem 0.55rem',
                cursor: unread === 0 ? 'default' : 'pointer',
              }}
            >
              Mark all read
            </button>
          </div>

          {/* Body */}
          <div style={{ marginTop: '0.6rem' }}>
            {loading && !inbox && (
              <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1.5rem 0' }}>
                Loading…
              </p>
            )}
            {inbox && inbox.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.42)', textAlign: 'center', padding: '1.5rem 0', lineHeight: 1.5 }}>
                No mail. The captain&apos;s desk is empty.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {inbox?.map(msg => {
                const expanded = expandedId === msg.id
                const isUnread = !msg.readAt
                const hasAttach = msg.attachmentGems > 0 || msg.attachmentDoubloons > 0
                const canClaim = hasAttach && !msg.claimedAt
                return (
                  <div
                    key={msg.id}
                    style={{
                      background: isUnread ? 'rgba(240,192,64,0.06)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${isUnread ? ACCENT + '33' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Row header — tap to expand */}
                    <button
                      onClick={() => handleExpand(msg)}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                        padding: '0.6rem 0.7rem',
                        background: 'transparent', border: 'none',
                        textAlign: 'left', cursor: 'pointer',
                      }}
                    >
                      {/* Unread dot rail */}
                      <span style={{
                        flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
                        marginTop: 6,
                        background: isUnread ? ACCENT : 'transparent',
                        boxShadow: isUnread ? `0 0 5px ${ACCENT}88` : 'none',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                          <p className="font-karla font-700 uppercase" style={{
                            flex: 1, minWidth: 0,
                            fontSize: '0.5rem', letterSpacing: '0.14em',
                            color: ACCENT_DIM,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {msg.senderLabel}
                          </p>
                          <span className="font-karla" style={{
                            flexShrink: 0,
                            fontSize: '0.58rem',
                            color: 'rgba(255,255,255,0.4)',
                          }}>
                            {relativeTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="font-cinzel font-700" style={{
                          fontSize: '0.85rem',
                          color: isUnread ? '#f0e8d0' : 'rgba(240,232,208,0.78)',
                          lineHeight: 1.25, marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {msg.subject}
                        </p>
                        {hasAttach && (
                          <div style={{ display: 'flex', gap: '0.35rem', marginTop: 5 }}>
                            {msg.attachmentGems > 0 && (
                              <span className="font-karla font-700" style={{
                                fontSize: '0.6rem',
                                color: msg.claimedAt ? 'rgba(167,139,250,0.45)' : '#a78bfa',
                                background: msg.claimedAt ? 'rgba(167,139,250,0.06)' : 'rgba(167,139,250,0.14)',
                                border: `1px solid ${msg.claimedAt ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.4)'}`,
                                borderRadius: 999,
                                padding: '0.1rem 0.45rem',
                                textDecoration: msg.claimedAt ? 'line-through' : 'none',
                              }}>
                                {msg.attachmentGems.toLocaleString()} ◆
                              </span>
                            )}
                            {msg.attachmentDoubloons > 0 && (
                              <span className="font-karla font-700" style={{
                                fontSize: '0.6rem',
                                color: msg.claimedAt ? 'rgba(240,192,64,0.45)' : ACCENT,
                                background: msg.claimedAt ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.14)',
                                border: `1px solid ${msg.claimedAt ? 'rgba(240,192,64,0.18)' : ACCENT + '66'}`,
                                borderRadius: 999,
                                padding: '0.1rem 0.45rem',
                                textDecoration: msg.claimedAt ? 'line-through' : 'none',
                              }}>
                                {msg.attachmentDoubloons.toLocaleString()} ⟡
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{
                        flexShrink: 0, marginTop: 5,
                        transition: 'transform 0.18s',
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>

                    {/* Expanded body */}
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          key="expand"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            padding: '0 0.85rem 0.85rem 1.1rem',
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                          }}>
                            <p className="font-karla" style={{
                              fontSize: '0.82rem',
                              color: '#e0dccc',
                              lineHeight: 1.55,
                              marginTop: '0.65rem',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {msg.body}
                            </p>
                            {hasAttach && (
                              <button
                                onClick={() => handleClaim(msg)}
                                disabled={!canClaim || claimingId === msg.id}
                                className="font-cinzel font-700 uppercase"
                                style={{
                                  marginTop: '0.85rem',
                                  width: '100%',
                                  padding: '0.55rem 0.9rem',
                                  borderRadius: 10,
                                  fontSize: '0.78rem',
                                  letterSpacing: '0.1em',
                                  background: canClaim
                                    ? `linear-gradient(180deg, ${ACCENT}33 0%, ${ACCENT}18 100%)`
                                    : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${canClaim ? ACCENT + '88' : 'rgba(255,255,255,0.1)'}`,
                                  color: canClaim ? ACCENT : 'rgba(255,255,255,0.35)',
                                  cursor: canClaim ? 'pointer' : 'default',
                                  boxShadow: canClaim ? `0 2px 7px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)` : 'none',
                                }}
                              >
                                {claimingId === msg.id
                                  ? 'Claiming…'
                                  : msg.claimedAt
                                    ? 'Claimed'
                                    : 'Claim Reward'}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      </PopupShell>
    </>
  )
}
