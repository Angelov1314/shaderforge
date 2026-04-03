import { useState } from 'react'
import { useShaderStore } from '../../store/useShaderStore'
import { findSimilarTemplates } from '../../lib/db'
import styles from './GeneratePanel.module.css'

export function GeneratePanel() {
  const { db, setCode, setGenerating, isGenerating } = useShaderStore()
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<string[]>([])

  const generate = async () => {
    if (!prompt.trim() || isGenerating) return
    setGenerating(true)
    setRefs([])

    const similar = db ? findSimilarTemplates(db, prompt) : []
    if (similar.length > 0) {
      setRefs(similar.map(t => t.name))
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, templates: similar }),
      })

      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      // Stream tokens into editor
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE: "data: <token>\n\n"
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const token = line.slice(6)
            if (token === '[DONE]') break
            try { accumulated += JSON.parse(token) } catch { accumulated += token }
            setCode(accumulated)
          }
        }
      }
    } catch (e) {
      console.error('Generate error:', e)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.inner}>
        <textarea
          className={styles.textarea}
          placeholder="Describe your shader... e.g. 'blue ocean waves with foam', 'colorful fractal zoom', 'particle explosion'"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
          }}
          rows={2}
        />
        <div className={styles.row}>
          {refs.length > 0 && (
            <span className={styles.refs}>
              Using: {refs.join(', ')}
            </span>
          )}
          <button
            className={styles.btn}
            onClick={generate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? '⟳ Generating...' : '⚡ Generate  ⌘↵'}
          </button>
        </div>
      </div>
    </div>
  )
}
