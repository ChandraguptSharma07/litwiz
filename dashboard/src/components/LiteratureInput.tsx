import { useState, useRef } from 'react'

interface Props {
  onIngest: (text: string, title: string) => void
  onLoadDemo: () => void
  isLoading: boolean
  error: string | null
}

export default function LiteratureInput({ onIngest, onLoadDemo, isLoading, error }: Props) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const fileRef = useRef<HTMLInputElement>(null)

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const charCount = text.length
  const overLimit = charCount > 12000

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      setText(content)
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleSubmit() {
    if (!text.trim() || isLoading) return
    onIngest(text.trim(), title.trim())
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000000cc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: 680,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 20,
              marginBottom: 4,
            }}
          >
            Load Literature
          </div>
          <div style={{ fontSize: 11, color: '#71717a', lineHeight: 1.5 }}>
            Paste any excerpt from a novel, screenplay, play, or game script. Claude will extract
            the narrative structure and build the graph. Works with linear stories and branching
            narratives alike.
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['paste', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 20px',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                border: 'none',
                borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
                background: 'transparent',
                color: tab === t ? '#e4e4e7' : '#52525b',
                cursor: 'pointer',
              }}
            >
              {t === 'paste' ? 'Paste Text' : 'Upload File'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '16px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Title field */}
          <div>
            <label style={{ fontSize: 10, color: '#71717a', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              TITLE (optional — Claude will infer it if left blank)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hamlet, Act 1"
              style={{
                width: '100%',
                padding: '7px 10px',
                background: '#18181b',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: '#e4e4e7',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {tab === 'paste' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: 10, color: '#71717a', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                TEXT
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste any passage here — a chapter, a scene, an act, a section of a script. The more narrative structure (characters, scenes, decisions), the better the graph.

Example types that work well:
  • Novel chapters with scene breaks
  • Screenplay scenes
  • Choose Your Own Adventure passages
  • Play acts
  • Visual novel scripts`}
                style={{
                  flex: 1,
                  minHeight: 260,
                  padding: '10px',
                  background: '#0f0f10',
                  border: `1px solid ${overLimit ? '#ef4444' : 'var(--border)'}`,
                  borderRadius: 4,
                  color: '#e4e4e7',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div style={{ fontSize: 10, color: overLimit ? '#f87171' : '#52525b', marginTop: 4, textAlign: 'right' }}>
                {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
                {overLimit && ' — text will be truncated to 12,000 chars'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
              <input ref={fileRef} type="file" accept=".txt,.md,.fountain,.fdx" onChange={handleFile} style={{ display: 'none' }} />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '10px 24px',
                  borderRadius: 4,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  color: '#a1a1aa',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Choose .txt · .md · .fountain · .fdx
              </button>
              {text && (
                <div style={{ fontSize: 10, color: '#4ade80' }}>
                  ✓ File loaded — {wordCount.toLocaleString()} words
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                background: '#ef444420',
                border: '1px solid #ef444450',
                color: '#f87171',
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={onLoadDemo}
            disabled={isLoading}
            style={{
              fontSize: 11,
              padding: '6px 14px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: '#71717a',
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            Use Demo Narrative
          </button>

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isLoading}
            style={{
              fontSize: 11,
              padding: '8px 20px',
              borderRadius: 4,
              border: 'none',
              background: !text.trim() || isLoading ? '#27272a' : '#2563eb',
              color: !text.trim() || isLoading ? '#52525b' : '#fff',
              cursor: !text.trim() || isLoading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isLoading ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    border: '2px solid #ffffff40',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
                Parsing with Claude...
              </>
            ) : (
              '▶ Parse with AI'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
