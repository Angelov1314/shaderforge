import { useState, useEffect, useRef } from 'react'
import { useShaderStore } from '../../store/useShaderStore'
import styles from './UrlBar.module.css'

type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export function UrlBar() {
  const { setCode } = useShaderStore()
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<FetchStatus>('idle')
  const [message, setMessage] = useState('')
  const [rewritePrompt, setRewritePrompt] = useState('')
  const [showRewrite, setShowRewrite] = useState(false)
  const [fetchedCode, setFetchedCode] = useState('')
  const [shadertoyId, setShadertoyId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Listen for shader code posted from the injected script in the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SHADERFORGE_CODE') {
        const code = e.data.code as string
        setFetchedCode(code)
        setCode(code)
        setStatus('done')
        setMessage(`Loaded from Shadertoy #${e.data.id}`)
        setShowRewrite(true)
        setShadertoyId(null)
      }
      if (e.data?.type === 'SHADERFORGE_ERROR') {
        setStatus('error')
        setMessage(e.data.message)
        setShadertoyId(null)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [setCode])

  const fetch_ = async () => {
    if (!url.trim()) return
    setStatus('loading')
    setMessage('Fetching...')
    setShowRewrite(false)
    setShadertoyId(null)

    const trimmedUrl = url.trim()
    const shadertoyMatch = trimmedUrl.match(/shadertoy\.com\/view\/([A-Za-z0-9]+)/)

    if (shadertoyMatch) {
      // Open Shadertoy in hidden iframe, extract via injected script
      setShadertoyId(shadertoyMatch[1])
      setMessage('Opening Shadertoy...')
      return
    }

    // Non-Shadertoy: go through server
    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      setFetchedCode(data.code)
      setCode(data.code)
      setStatus('done')
      setMessage(`Loaded from ${data.source}`)
      setShowRewrite(true)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  // Inject extraction script once iframe loads
  const onIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !shadertoyId) return
    try {
      const win = iframe.contentWindow as Window & {
        gShaderToy?: { mEffect?: { mPasses?: Array<{ mSource: string; mType: string }> } }
        ShaderToy?: unknown
      }
      // Try immediately
      const passes = win.gShaderToy?.mEffect?.mPasses
      if (passes) {
        const imgPass = passes.find((p) => p.mType === 'image') || passes[0]
        if (imgPass?.mSource) {
          window.postMessage({ type: 'SHADERFORGE_CODE', code: imgPass.mSource, id: shadertoyId }, '*')
          return
        }
      }
      // Inject a polling script into the page
      const script = iframe.contentDocument?.createElement('script')
      if (!script) throw new Error('Cannot inject script (cross-origin blocked)')
      script.textContent = `
        (function poll(n) {
          var passes = window.gShaderToy && window.gShaderToy.mEffect && window.gShaderToy.mEffect.mPasses;
          if (passes) {
            var img = passes.find(function(p){return p.mType==='image'}) || passes[0];
            if (img && img.mSource) {
              window.parent.postMessage({type:'SHADERFORGE_CODE', code: img.mSource, id: '${shadertoyId}'}, '*');
              return;
            }
          }
          if (n > 0) setTimeout(function(){poll(n-1)}, 500);
          else window.parent.postMessage({type:'SHADERFORGE_ERROR', message:'Shader data not found. Try clicking "Allow" on Shadertoy if prompted.'}, '*');
        })(20);
      `
      iframe.contentDocument?.head.appendChild(script)
    } catch {
      // Cross-origin error — Shadertoy loaded but we can't access it
      // Try reading via postMessage relay (won't work cross-origin without cooperation)
      setStatus('error')
      setMessage('Shadertoy blocked script injection (cross-origin). See instructions below.')
      setShadertoyId(null)
    }
  }

  const rewrite = async () => {
    if (!rewritePrompt.trim() || !fetchedCode) return
    setStatus('loading')
    setMessage('Rewriting...')

    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: fetchedCode, prompt: rewritePrompt }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const token = line.slice(6)
            if (token === '[DONE]') break
            try { accumulated += JSON.parse(token) } catch { accumulated += token }
            setCode(accumulated)
          }
        }
      }

      setFetchedCode(accumulated)
      setStatus('done')
      setMessage('Rewritten')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Rewrite failed')
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <span className={styles.icon}>⬡</span>
        <input
          className={styles.input}
          placeholder="shadertoy.com/view/XXXXX  or  github.com/.../shader.glsl"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetch_()}
        />
        <button
          className={`${styles.btn} ${status === 'loading' ? styles.loading : ''}`}
          onClick={fetch_}
          disabled={status === 'loading' || !url.trim()}
        >
          {status === 'loading' ? '...' : 'Load'}
        </button>

        {message && (
          <span className={`${styles.msg} ${styles[status]}`}>{message}</span>
        )}
      </div>

      {/* Hidden iframe for Shadertoy extraction */}
      {shadertoyId && (
        <div className={styles.iframeWrap}>
          <div className={styles.iframeHint}>
            正在从 Shadertoy 提取 shader... 如果卡住请手动复制代码粘贴到编辑器。
          </div>
          <iframe
            ref={iframeRef}
            src={`https://www.shadertoy.com/view/${shadertoyId}`}
            className={styles.iframe}
            onLoad={onIframeLoad}
            sandbox="allow-scripts allow-same-origin"
            title="Shadertoy loader"
          />
          <button className={styles.cancelIframe} onClick={() => { setShadertoyId(null); setStatus('idle'); setMessage('') }}>
            取消
          </button>
        </div>
      )}

      {/* Cross-origin fallback instructions */}
      {status === 'error' && message.includes('cross-origin') && (
        <div className={styles.fallback}>
          <strong>手动提取方式：</strong>
          <ol>
            <li>在浏览器打开 <code>{url}</code></li>
            <li>按 <kbd>F12</kbd> 打开控制台</li>
            <li>粘贴：<code>copy(gShaderToy.mEffect.mPasses.find(p=&gt;p.mType==='image').mSource)</code></li>
            <li>回车后代码已复制到剪贴板，直接粘贴到编辑器</li>
          </ol>
        </div>
      )}

      {showRewrite && (
        <div className={styles.rewriteRow}>
          <input
            className={styles.rewriteInput}
            placeholder="改写 shader... 如 'make it purple', 'add mouse interaction'"
            value={rewritePrompt}
            onChange={e => setRewritePrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && rewrite()}
          />
          <button
            className={styles.rewriteBtn}
            onClick={rewrite}
            disabled={status === 'loading' || !rewritePrompt.trim()}
          >
            ✦ Rewrite
          </button>
          <button className={styles.closeBtn} onClick={() => setShowRewrite(false)}>✕</button>
        </div>
      )}
    </div>
  )
}
