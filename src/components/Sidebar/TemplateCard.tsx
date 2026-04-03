import type { ShaderTemplate } from '../../types'
import styles from './TemplateCard.module.css'

interface Props {
  template: ShaderTemplate
  isSelected: boolean
  onClick: () => void
}

const SOURCE_ICONS: Record<string, string> = {
  github: 'GH',
  'google-drive': 'GD',
  local: 'LC',
  url: 'URL',
}

export function TemplateCard({ template, isSelected, onClick }: Props) {
  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
    >
      <div className={styles.row}>
        <span className={styles.name}>{template.name}</span>
        <span className={styles.source}>{SOURCE_ICONS[template.source] ?? '?'}</span>
      </div>
      <div className={styles.desc}>{template.description}</div>
      <div className={styles.tags}>
        {template.techStack.slice(0, 4).map(t => (
          <span key={t} className={styles.tag}>{t}</span>
        ))}
        {template.stars != null && (
          <span className={styles.stars}>★ {template.stars >= 1000
            ? `${(template.stars / 1000).toFixed(1)}k`
            : template.stars}
          </span>
        )}
      </div>
    </div>
  )
}
