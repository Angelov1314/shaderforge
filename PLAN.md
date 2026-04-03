# Implementation Plan: ShaderForge App

## Overview
A local Shadertoy-like IDE with Monaco editor, WebGL live preview, and AI-powered shader generation backed by a template database. Built Vite-first with a clean abstraction layer so Tauri can be dropped in later without refactoring.

## Success Criteria
- [ ] WebGL preview renders Shadertoy-compatible GLSL in real time
- [ ] Template library loads from `~/.claude/template-forge/db.json`
- [ ] Claude API generates shaders from natural language descriptions
- [ ] GitHub shader repos can be scanned and added to DB
- [ ] Export to `.glsl` and standalone `preview.html`
- [ ] Tauri wrapper adds desktop packaging with zero code changes to React app

---

## Project Structure

```
shaderforge/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── TemplateLibrary.tsx
│   │   │   ├── TemplateCard.tsx
│   │   │   └── ScanModal.tsx
│   │   ├── Editor/
│   │   │   ├── ShaderEditor.tsx
│   │   │   └── editorConfig.ts
│   │   ├── Preview/
│   │   │   ├── WebGLCanvas.tsx
│   │   │   ├── useShaderProgram.ts
│   │   │   └── shadertoyUniforms.ts
│   │   └── GeneratePanel/
│   │       ├── GeneratePanel.tsx
│   │       └── useGenerate.ts
│   ├── lib/
│   │   ├── platform.ts
│   │   ├── db.ts
│   │   ├── github.ts
│   │   ├── claudeApi.ts
│   │   └── export.ts
│   ├── store/
│   │   └── useShaderStore.ts
│   └── types/
│       └── index.ts
├── server/
│   └── index.ts
├── src-tauri/          # Added in Phase 4
├── PLAN.md
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## Key Dependencies

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6",
    "zustand": "^4",
    "@anthropic-ai/sdk": "^0.39",
    "express": "^4"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5"
  }
}
```

**Tauri (Phase 4 only):** `@tauri-apps/cli`, `@tauri-apps/api`

---

## Architecture: Platform Abstraction (Critical for Tauri migration)

`src/lib/platform.ts` is the key layer. All FS/shell operations go through here:

```typescript
// Web mode: calls Express dev server at localhost:3001
// Tauri mode: calls tauri invoke() commands
export const platform = {
  readFile: (path: string) => ...,
  writeFile: (path: string, content: string) => ...,
  runCommand: (cmd: string) => ...,
}
```

Switching from web → Tauri = **change platform.ts only**.

---

## Phase 1: Project Scaffold + WebGL Preview ✅ Target: Day 1

### Steps
1. `npm create vite@latest shaderforge -- --template react-ts`
2. Install deps: `@monaco-editor/react`, `zustand`
3. Create `App.tsx` — 3-column CSS grid layout (sidebar 280px | editor flex | preview flex)
4. Create `src/components/Preview/WebGLCanvas.tsx`
   - Canvas fills right panel
   - Shadertoy uniforms: `iTime`, `iResolution`, `iMouse`, `iFrame`
   - `requestAnimationFrame` render loop
5. Create `src/components/Preview/useShaderProgram.ts`
   - Compile vertex + fragment shader
   - Surface compile errors to editor gutter
   - Hot-reload on code change (debounce 300ms)
6. Create `src/components/Editor/ShaderEditor.tsx`
   - Monaco with GLSL language
   - Default shader: classic Shadertoy template (`mainImage` signature)
7. Wire editor → preview via Zustand `useShaderStore`

### Verification
- [ ] Vite dev server starts, renders 3-panel layout
- [ ] Default GLSL shader renders animated gradient in preview
- [ ] Editing code updates preview in real time
- [ ] Shader compile errors shown in editor gutter

---

## Phase 2: Template Library + DB Integration ✅ Target: Day 1–2

### Steps
1. Create `server/index.ts` — Express on port 3001
   - `GET /api/db` — reads `~/.claude/template-forge/db.json`
   - `POST /api/db` — writes updated db
   - `POST /api/scan` — runs `gh repo clone` + analyze
   - `GET /api/export` — writes file to disk
2. Create `src/lib/db.ts` — typed read/write via `fetch('/api/db')`
3. Create `src/lib/platform.ts` — web mode routes to Express
4. Create `src/components/Sidebar/TemplateLibrary.tsx`
   - Group templates by category
   - Search/filter bar
   - Click to load template into editor
5. Create `src/components/Sidebar/TemplateCard.tsx`
6. Update `vite.config.ts` to proxy `/api` → `localhost:3001`

### Verification
- [ ] Sidebar loads templates from db.json
- [ ] Clicking a template loads code into Monaco editor
- [ ] Category grouping renders correctly
- [ ] Empty state shows onboarding message

---

## Phase 3: AI Generation + GitHub Scanning ✅ Target: Day 2–3

### Steps

**AI Generation:**
1. Create `src/lib/claudeApi.ts`
   - `generateShader(description, similarTemplates[])`
   - System prompt: Shadertoy-compatible GLSL, `mainImage` signature
   - Pass top 3 similar templates as RAG context
2. Create `src/components/GeneratePanel/useGenerate.ts`
   - Keyword similarity matching against `template.tags + techStack`
   - Streaming response → updates editor in real time
3. Create `src/components/GeneratePanel/GeneratePanel.tsx`
   - Textarea, Generate button, matched template references

**GitHub Scanning:**
1. Create `src/lib/github.ts` — calls `POST /api/scan`
   - Server runs `gh api repos/<owner>/<repo>`, gets file tree
   - Detects shader files (`.glsl`, `.frag`, `.vert`)
   - Writes to db.json
2. Create `src/components/Sidebar/ScanModal.tsx`

**Export:**
1. Create `src/lib/export.ts`
   - `exportGlsl(code)` → saves `shader.glsl`
   - `exportHtml(code)` → self-contained HTML with inline WebGL boilerplate

### Verification
- [ ] "Blue ocean waves" generates valid GLSL
- [ ] Streaming tokens appear in editor as Claude responds
- [ ] Scanning a GitHub repo adds shaders to DB
- [ ] Export produces `.glsl` and standalone `preview.html`

---

## Phase 4: Tauri Packaging ✅ Target: Day 3–4

### Steps
1. `npm run tauri init`
2. Add Tauri FS + shell commands in `src-tauri/src/main.rs`
3. Update `src/lib/platform.ts`:
   ```typescript
   const isTauri = '__TAURI__' in window
   export const platform = isTauri ? tauriAdapter : webAdapter
   ```
4. Remove Express from production build
5. Configure `tauri.conf.json` (app name, icons, window 1400×900)
6. `npm run tauri build` → `.app` / `.exe`

### Verification
- [ ] `npm run tauri dev` opens native window
- [ ] File operations work via Tauri commands
- [ ] `npm run tauri build` produces distributable

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Monaco GLSL syntax support is basic | Low | Register `glsl` language ID with keyword list |
| `gh` CLI not available in Tauri build | Medium | Bundle gh binary or use GitHub REST API fallback |
| Claude API key exposure in web mode | High | Store in `.env`, always call via Express/Tauri backend |
| WebGL shader compile errors crash canvas | Medium | try/catch, keep last good program running |
| db.json path differs per OS in Tauri | Low | Use Tauri `appDataDir()` or keep `~/.claude/template-forge/` |

---

## Build Order

```
Phase 1 → Vite scaffold + WebGL preview      (foundation)
Phase 2 → Express server + DB integration    (template library)
Phase 3 → Claude API + GitHub scanning       (intelligence)
Phase 4 → Tauri wrapper                      (packaging)
```
