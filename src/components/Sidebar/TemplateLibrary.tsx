import { useEffect, useState } from 'react'
import { useShaderStore } from '../../store/useShaderStore'
import { loadDB, getTemplatesByCategory, searchTemplates } from '../../lib/db'
import { TemplateCard } from './TemplateCard'
import { ScanModal } from './ScanModal'
import type { ShaderTemplate } from '../../types'
import styles from './TemplateLibrary.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  shader: 'Shaders',
  glsl: 'GLSL',
  'ray-marching': 'Ray Marching',
  noise: 'Noise & Procedural',
  particle: 'Particles',
  web: 'Web',
  other: 'Other',
}

export function TemplateLibrary() {
  const { db, setDB, selectedTemplate, loadTemplate } = useShaderStore()
  const [query, setQuery] = useState('')
  const [showScan, setShowScan] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDB().then(d => { setDB(d); setLoading(false) })
  }, [setDB])

  const templates = db
    ? (query
        ? searchTemplates(db, query)
        : null)
    : null

  const grouped = db && !query ? getTemplatesByCategory(db) : null
  const totalCount = db ? Object.keys(db.templates).length : 0

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>ShaderForge</span>
        <button className={styles.scanBtn} onClick={() => setShowScan(true)} title="Scan GitHub repo">+</button>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Search templates..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.list}>
        {loading && <div className={styles.empty}>Loading...</div>}

        {!loading && totalCount === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>No templates yet</div>
            <div className={styles.emptyHint}>Press + to scan a GitHub repo</div>
          </div>
        )}

        {templates && templates.map(t => (
          <TemplateCard
            key={t.id}
            template={t}
            isSelected={selectedTemplate?.id === t.id}
            onClick={() => loadTemplate(t)}
          />
        ))}

        {grouped && Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className={styles.categoryHeader}>
              {CATEGORY_LABELS[cat] ?? cat}
              <span className={styles.categoryCount}>{list.length}</span>
            </div>
            {list.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                isSelected={selectedTemplate?.id === t.id}
                onClick={() => loadTemplate(t)}
              />
            ))}
          </div>
        ))}
      </div>

      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onScanned={() => {
            loadDB().then(d => setDB(d))
            setShowScan(false)
          }}
        />
      )}
    </div>
  )
}
