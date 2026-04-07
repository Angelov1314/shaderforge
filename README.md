# ShaderForge

A local Shadertoy-compatible GLSL IDE with Monaco editor, real-time WebGL preview, and AI-powered shader generation via Claude. Designed for fast iteration — describe a shader in plain language and watch it stream into the editor.

## Features

- **Live WebGL Preview** — Shadertoy-compatible uniforms (`iTime`, `iResolution`, `iMouse`, `iFrame`) with real-time recompile on edit
- **Monaco Editor** — Full GLSL syntax highlighting and editing experience
- **AI Shader Generation** — Describe a shader in natural language; Claude streams GLSL directly into the editor
- **Shadertoy URL Import** — Paste a `shadertoy.com/view/…` link to extract and load the GLSL directly into the editor, with optional AI rewrite
- **Template Library** — Browse and load shaders from a local database (`~/.claude/template-forge/db.json`)
- **GitHub Scanner** — Scan public shader repos and add them to your local template DB
- **Export** — Save as `.glsl` file or standalone `preview.html`
- **Tauri-ready** — Platform abstraction layer allows future desktop packaging with zero refactoring

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Start dev server (Vite frontend + Express API backend)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Architecture

```
shaderforge/
├── src/
│   ├── components/
│   │   ├── Editor/        # Monaco GLSL editor
│   │   ├── Preview/       # WebGL canvas + Shadertoy uniforms
│   │   ├── Sidebar/       # Template library + scan modal
│   │   ├── Toolbar/       # URL bar for Shadertoy import
│   │   └── GeneratePanel/ # AI generation UI + SSE streaming
│   ├── lib/
│   │   ├── platform.ts    # FS abstraction (web ↔ Tauri)
│   │   └── db.ts          # Template database
│   └── store/             # Zustand global state
└── server/
    └── index.cjs          # Express API proxy for Claude
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| State | Zustand |
| Backend | Express (API proxy) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Deploy | Railway / Render (config included) |

## Environment Variables

```env
ANTHROPIC_API_KEY=your_key_here
```

## Deployment

Railway and Render configuration files are included (`railway.json`, `render.yaml`).

```bash
npm run build   # Production build
npm start       # Start production server
```
