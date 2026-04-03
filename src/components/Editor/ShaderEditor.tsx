import Editor, { OnMount } from '@monaco-editor/react'
import { useShaderStore } from '../../store/useShaderStore'
import { registerGLSL, EDITOR_OPTIONS } from './editorConfig'
import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import styles from './ShaderEditor.module.css'

export function ShaderEditor() {
  const { code, errors, setCode, forceRecompile, setDB } = useShaderStore()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const externalUpdateRef = useRef(false)

  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSavePopover, setShowSavePopover] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    registerGLSL(monaco)
    monaco.editor.setTheme('shaderforge-dark')

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      useShaderStore.getState().forceRecompile()
    })
    editor.addCommand(monaco.KeyCode.F5, () => {
      useShaderStore.getState().forceRecompile()
    })
    // ⌘S / Ctrl+S → open save popover
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      setShowSavePopover(true)
    })

    editor.onDidChangeModelContent(() => {
      if (externalUpdateRef.current) return
      setCode(editor.getValue())
    })
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const current = editor.getValue()
    if (current === code) return
    externalUpdateRef.current = true
    editor.setValue(code)
    externalUpdateRef.current = false
  }, [code])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return
    const model = editor.getModel()
    if (!model) return
    const markers: Monaco.editor.IMarkerData[] = errors.map(e => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line,
      startColumn: 1,
      endLineNumber: e.line,
      endColumn: model.getLineMaxColumn(Math.min(e.line, model.getLineCount())) || 100,
      message: e.message,
    }))
    monaco.editor.setModelMarkers(model, 'glsl', markers)
  }, [errors])

  // Focus name input when popover opens
  useEffect(() => {
    if (showSavePopover) {
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [showSavePopover])

  const handleSave = async () => {
    const name = saveName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/save-shader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
      })
      if (!res.ok) throw new Error('Save failed')
      // Refresh DB in sidebar
      const dbRes = await fetch('/api/db')
      if (dbRes.ok) setDB(await dbRes.json())
      setSaveStatus('ok')
      setTimeout(() => {
        setShowSavePopover(false)
        setSaveStatus('idle')
        setSaveName('')
      }, 1000)
    } catch {
      setSaveStatus('err')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Shader</span>
        <span className={styles.lang}>GLSL</span>
        <span className={styles.hint}>⌘↵ compile</span>
        <div className={styles.saveWrap}>
          <button
            className={styles.saveBtn}
            onClick={() => setShowSavePopover(v => !v)}
            title="Save shader (⌘S)"
          >
            ↓ Save
          </button>
          {showSavePopover && (
            <div className={styles.savePopover}>
              <input
                ref={nameInputRef}
                className={styles.saveInput}
                placeholder="Shader name..."
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setShowSavePopover(false)
                }}
              />
              <button
                className={styles.saveConfirmBtn}
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
              >
                {saveStatus === 'ok' ? '✓ Saved' : saveStatus === 'err' ? '✗ Error' : saving ? '...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
      <Editor
        height="100%"
        defaultLanguage="glsl"
        defaultValue={code}
        onMount={handleMount}
        options={EDITOR_OPTIONS}
        loading={<div className={styles.loading}>Loading editor...</div>}
      />
    </div>
  )
}
