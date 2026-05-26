export default function ContactPage() {
  return (
    <>
      <main className="min-h-screen flex items-center justify-center px-6">
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: '0.5rem' }}>
            Shibling Games
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
            Contact
          </h1>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#5a5855', lineHeight: 1.8, marginBottom: '2rem' }}>
            Got a question, bug report, or feedback? We&apos;d love to hear from you.
          </p>
          <a
            href="mailto:hello@shiblinggames.com"
            style={{
              display: 'inline-block',
              background: 'rgba(240,192,64,0.08)',
              border: '1px solid rgba(240,192,64,0.25)',
              borderRadius: 12,
              padding: '0.85rem 1.75rem',
              color: '#f0c040',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
            className="font-karla font-700 uppercase tracking-[0.12em]"
          >
            hello@shiblinggames.com
          </a>
        </div>
      </main>
    </>
  )
}
