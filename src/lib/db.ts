import type { ShaderDB, ShaderTemplate } from '../types'

// DB_PATH is only used server-side; the browser always hits /api/db

export async function loadDB(): Promise<ShaderDB> {
  try {
    const res = await fetch('/api/db')
    if (!res.ok) throw new Error('DB not found')
    return res.json()
  } catch {
    return { version: 2, lastUpdated: new Date().toISOString(), templates: {} }
  }
}

export async function saveDB(db: ShaderDB): Promise<void> {
  await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(db),
  })
}

export async function addTemplate(template: ShaderTemplate): Promise<void> {
  const db = await loadDB()
  db.templates[template.id] = template
  db.lastUpdated = new Date().toISOString()
  await saveDB(db)
}

export function getTemplatesByCategory(db: ShaderDB): Record<string, ShaderTemplate[]> {
  const grouped: Record<string, ShaderTemplate[]> = {}
  for (const t of Object.values(db.templates)) {
    const key = t.category || 'other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  }
  // Sort each group by score desc
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => b.score - a.score)
  }
  return grouped
}

export function searchTemplates(db: ShaderDB, query: string): ShaderTemplate[] {
  const q = query.toLowerCase()
  return Object.values(db.templates)
    .filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)) ||
      t.techStack.some(s => s.toLowerCase().includes(q))
    )
    .sort((a, b) => b.score - a.score)
}

export function findSimilarTemplates(db: ShaderDB, description: string, limit = 3): ShaderTemplate[] {
  const words = description.toLowerCase().split(/\s+/)
  return Object.values(db.templates)
    .map(t => {
      const haystack = [
        ...t.tags, ...t.techStack, t.name, t.description, t.category
      ].join(' ').toLowerCase()
      const score = words.filter(w => haystack.includes(w)).length
      return { template: t, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ template }) => template)
}
