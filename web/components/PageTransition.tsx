// No `key={pathname}` on purpose. Keying this wrapper by pathname forced React
// to unmount the entire subtree and remount it from scratch on every tab click,
// defeating App Router's layout reconciliation, re-running heavy useEffects,
// re-initialising audio, and discarding in-memory state on every navigation.
// Without the key, layouts stay mounted and only the page slot reconciles, the
// way RSC is designed to work. The wrapper itself stays for the `position:
// relative; z-index: 1` stacking context that Nav and fixed UI rely on
// (do NOT add animation/transform/filter here — see [[feedback_pagetransition_ios_pwa]]).
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {children}
    </div>
  )
}
