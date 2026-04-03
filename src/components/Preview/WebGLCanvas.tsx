import { useRef, useState, useEffect, useCallback } from 'react'
import { useShaderStore } from '../../store/useShaderStore'
import { useShaderProgram } from './useShaderProgram'
import styles from './WebGLCanvas.module.css'

export function WebGLCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { code, errors, setErrors, setCode, compileKey } = useShaderStore()
  const [adapting, setAdapting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const controls = useShaderProgram(canvasRef, { code, compileKey, onErrors: setErrors })

  const togglePause = useCallback(() => {
    if (controls.isPaused()) { controls.resume(); setPaused(false) }
    else { controls.pause(); setPaused(true) }
  }, [controls])

  const resetTime = useCallback(() => {
    controls.resetTime()
    setPaused(false)
  }, [controls])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  // Track fullscreen state changes (Esc key exits without our toggle)
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Keyboard shortcuts when preview is focused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only handle if target is body / canvas (not inside editor input)
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.target as HTMLElement).closest('.monaco-editor')) return
      if (e.code === 'Space') { e.preventDefault(); togglePause() }
      if (e.code === 'KeyR') resetTime()
      if (e.code === 'KeyF') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, resetTime, toggleFullscreen])

  const handleAdapt = async () => {
    setAdapting(true)
    try {
      const res = await fetch('/api/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, errors }),
      })
      if (!res.ok || !res.body) throw new Error('Server error')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let adapted = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const chunk = line.slice(6)
          if (chunk === '[DONE]') break
          try { adapted += JSON.parse(chunk) } catch { adapted += chunk }
        }
      }
      if (adapted) setCode(adapted)
    } catch (e) {
      console.error('Adapt failed:', e)
    } finally {
      setAdapting(false)
    }
  }

  return (
    <div ref={containerRef} className={`${styles.container} ${fullscreen ? styles.fullscreenContainer : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Preview</span>
        {errors.length > 0 && (
          <span className={styles.errorBadge}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>
        )}
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} onClick={togglePause} title={paused ? 'Resume (Space)' : 'Pause (Space)'}>
            {paused ? '▶' : '⏸'}
          </button>
          <button className={styles.ctrlBtn} onClick={resetTime} title="Reset time (R)">
            ↺
          </button>
          <button className={`${styles.ctrlBtn} ${fullscreen ? styles.ctrlBtnActive : ''}`} onClick={toggleFullscreen} title="Fullscreen (F)">
            {fullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className={styles.canvas} />

      {/* Fullscreen overlay controls — shown on hover */}
      {fullscreen && (
        <div className={styles.fsOverlay}>
          <button className={styles.fsCtrl} onClick={togglePause}>{paused ? '▶' : '⏸'}</button>
          <button className={styles.fsCtrl} onClick={resetTime}>↺</button>
          <button className={styles.fsCtrl} onClick={toggleFullscreen}>⊡</button>
          <span className={styles.fsHint}>Space · R · F · Mouse drag</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className={styles.errorPanel}>
          <div className={styles.errorActions}>
            <button className={styles.adaptBtn} onClick={handleAdapt} disabled={adapting}>
              {adapting ? '⟳ Adapting...' : '⚡ Auto-Adapt (AI)'}
            </button>
          </div>
          {errors.map((e, i) => (
            <div key={i} className={styles.errorLine}>
              <span className={styles.errorLineNum}>L{e.line}</span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
