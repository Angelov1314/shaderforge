import { create } from 'zustand'
import type { ShaderTemplate, ShaderDB, ShaderError } from '../types'

const DEFAULT_SHADER = `// ShaderForge — default shader
// Shadertoy-compatible: use iTime, iResolution, iMouse

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Animated gradient
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));

    // Vignette
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    col *= pow(vig * 15.0, 0.25);

    fragColor = vec4(col, 1.0);
}
`

interface ShaderState {
  code: string
  errors: ShaderError[]
  db: ShaderDB | null
  selectedTemplate: ShaderTemplate | null
  isGenerating: boolean
  compileKey: number
  setCode: (code: string) => void
  setErrors: (errors: ShaderError[]) => void
  setDB: (db: ShaderDB) => void
  loadTemplate: (template: ShaderTemplate) => void
  setGenerating: (v: boolean) => void
  forceRecompile: () => void
}

export const useShaderStore = create<ShaderState>((set) => ({
  code: DEFAULT_SHADER,
  errors: [],
  db: null,
  selectedTemplate: null,
  isGenerating: false,
  compileKey: 0,
  setCode: (code) => set({ code }),
  setErrors: (errors) => set({ errors }),
  setDB: (db) => set({ db }),
  loadTemplate: (template) => set({ selectedTemplate: template, code: template.glslCode || DEFAULT_SHADER }),
  setGenerating: (v) => set({ isGenerating: v }),
  forceRecompile: () => set((s) => ({ compileKey: s.compileKey + 1 })),
}))

export { DEFAULT_SHADER }
