import { useState } from 'react'
import styles from './ScanModal.module.css'

interface Props {
  onClose: () => void
  onScanned: () => void
}

export function ScanModal({ onClose, onScanned }: Props) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const scan = async () => {
    if (!url.trim()) return
    setStatus('scanning')
    setMessage('Scanning...')
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setStatus('done')
      setMessage(`Added ${data.count ?? 1} template(s): ${data.names?.join(', ') ?? data.name}`)
      setTimeout(onScanned, 1200)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span>Scan Template Source</span>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>GitHub URL or local path</label>
          <input
            className={styles.input}
            placeholder="https://github.com/owner/shader-repo"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && scan()}
            autoFocus
          />
          <div className={styles.hints}>
            <span>Examples:</span>
            <code>https://github.com/nicoptere/GLSL-noise</code>
            <code>/Users/me/my-shaders</code>
          </div>

          {message && (
            <div className={`${styles.status} ${styles[status]}`}>{message}</div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.scanBtn}
            onClick={scan}
            disabled={status === 'scanning' || !url.trim()}
          >
            {status === 'scanning' ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>
    </div>
  )
}
