export interface ShaderTemplate {
  id: string
  name: string
  source: 'github' | 'google-drive' | 'local' | 'url'
  sourceUrl?: string
  description: string
  techStack: string[]
  category: string
  subcategory?: string
  tags: string[]
  language: string
  framework?: string
  stars?: number
  license?: string
  fileTree?: string[]
  glslCode?: string
  score: number
  addedAt: string
  lastScanned: string
}

export interface ShaderDB {
  version: number
  lastUpdated: string
  templates: Record<string, ShaderTemplate>
}

export interface ShaderError {
  line: number
  message: string
}
