import { TemplateLibrary } from './components/Sidebar/TemplateLibrary'
import { ShaderEditor } from './components/Editor/ShaderEditor'
import { WebGLCanvas } from './components/Preview/WebGLCanvas'
import { GeneratePanel } from './components/GeneratePanel/GeneratePanel'
import { UrlBar } from './components/Toolbar/UrlBar'
import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.app}>
      {/* Left: template library */}
      <aside className={styles.sidebar}>
        <TemplateLibrary />
      </aside>

      {/* Center: URL bar + editor + AI panel */}
      <div className={styles.editorCol}>
        <UrlBar />
        <div className={styles.editor}>
          <ShaderEditor />
        </div>
        <GeneratePanel />
      </div>

      {/* Right: WebGL preview */}
      <div className={styles.preview}>
        <WebGLCanvas />
      </div>
    </div>
  )
}
