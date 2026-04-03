// ShaderForge — Express FS Bridge (web mode)
// Replaced by Tauri commands in Phase 4
// Load .env manually to avoid dotenvx shell interception
const _fs = require('fs'), _path = require('path')
const _envPath = _path.join(__dirname, '../.env')
if (_fs.existsSync(_envPath)) {
  _fs.readFileSync(_envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  })
}
const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync, spawn } = require('child_process')

const app = express()
app.use(express.json({ limit: '10mb' }))

// In production, serve the Vite build
const isProd = process.env.NODE_ENV === 'production'
if (isProd) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
}

// DB: use ./data/ in production (writable in Railway volumes), ~/.claude/... locally
const DATA_DIR = isProd
  ? path.join(__dirname, '../data')
  : path.join(os.homedir(), '.claude/template-forge')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
const DB_PATH = path.join(DATA_DIR, 'db.json')
const CATEGORIES_PATH = path.join(DATA_DIR, 'categories.json')

// --- DB endpoints ---

app.get('/api/db', (req, res) => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8')
    res.json(JSON.parse(data))
  } catch {
    res.json({ version: 2, lastUpdated: new Date().toISOString(), templates: {} })
  }
})

app.post('/api/db', (req, res) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// --- Generic FS endpoints (platform.ts) ---

app.get('/api/fs/read', (req, res) => {
  try {
    const filePath = req.query.path
    if (!filePath) return res.status(400).send('Missing path')
    res.send(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    res.status(404).send(e.message)
  }
})

app.post('/api/fs/write', (req, res) => {
  try {
    const { path: filePath, content } = req.body
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// --- GitHub scan ---

app.post('/api/scan', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    let templates = []

    if (url.startsWith('https://github.com') || url.startsWith('gh:')) {
      templates = await scanGitHub(url)
    } else if (url.startsWith('/') || url.startsWith('~')) {
      templates = await scanLocal(url.replace(/^~/, os.homedir()))
    } else {
      return res.status(400).json({ error: 'Unsupported source. Use GitHub URL or local path.' })
    }

    // Write to db
    const db = readDB()
    for (const t of templates) {
      db.templates[t.id] = t
    }
    db.lastUpdated = new Date().toISOString()
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))

    res.json({ ok: true, count: templates.length, names: templates.map(t => t.name) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) }
  catch { return { version: 2, lastUpdated: new Date().toISOString(), templates: {} } }
}

async function scanGitHub(url) {
  // Extract owner/repo
  const match = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
  if (!match) throw new Error('Invalid GitHub URL')
  const [, owner, repo] = match
  const repoName = repo.replace(/\.git$/, '')

  let meta
  try {
    const raw = execSync(`gh api repos/${owner}/${repoName}`, { encoding: 'utf8' })
    meta = JSON.parse(raw)
    if (meta.message === 'Not Found') throw new Error('404')
  } catch (e) {
    const is404 = e.message?.includes('404') || e.stderr?.includes('404')
    if (is404) throw new Error(`Repo "${owner}/${repoName}" not found. Check the URL.`)
    throw new Error(`GitHub API error: ${e.message}. Try: gh auth login`)
  }

  // Get file tree
  let tree = []
  try {
    const raw = execSync(`gh api "repos/${owner}/${repoName}/git/trees/HEAD?recursive=1"`, { encoding: 'utf8' })
    const data = JSON.parse(raw)
    tree = (data.tree || []).filter(f => f.type === 'blob').map(f => f.path)
  } catch { /* ignore */ }

  // Detect shader files
  const shaderFiles = tree.filter(f => /\.(glsl|frag|vert|fs|vs|shadertoy)$/i.test(f))

  // Try to read first shader
  let glslCode = ''
  if (shaderFiles.length > 0) {
    try {
      const raw = execSync(`gh api "repos/${owner}/${repoName}/contents/${shaderFiles[0]}"`, { encoding: 'utf8' })
      const fileData = JSON.parse(raw)
      glslCode = Buffer.from(fileData.content, 'base64').toString('utf8')
    } catch { /* ignore */ }
  }

  const id = `${repoName}-${owner}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  const template = {
    id,
    name: meta.name || repoName,
    source: 'github',
    sourceUrl: `https://github.com/${owner}/${repoName}`,
    description: meta.description || '',
    techStack: detectTechStack(tree, meta.topics || []),
    category: detectCategory(tree, meta.topics || [], meta.description || ''),
    tags: meta.topics || [],
    language: meta.language || 'GLSL',
    stars: meta.stargazers_count || 0,
    license: meta.license?.spdx_id || '',
    fileTree: tree.slice(0, 100),
    glslCode: glslCode || generateDefaultShader(meta.name),
    score: scoreTemplate(meta),
    addedAt: new Date().toISOString(),
    lastScanned: new Date().toISOString(),
  }

  return [template]
}

async function scanLocal(dirPath) {
  if (!fs.existsSync(dirPath)) throw new Error(`Path not found: ${dirPath}`)

  const getAllFiles = (dir, depth = 0) => {
    if (depth > 4) return []
    return fs.readdirSync(dir).flatMap(f => {
      const full = path.join(dir, f)
      if (['node_modules', '.git', 'vendor'].includes(f)) return []
      const stat = fs.statSync(full)
      return stat.isDirectory() ? getAllFiles(full, depth + 1) : [full.replace(dirPath + '/', '')]
    })
  }

  const tree = getAllFiles(dirPath)
  const shaderFiles = tree.filter(f => /\.(glsl|frag|vert|fs|vs)$/i.test(f))

  let glslCode = ''
  if (shaderFiles.length > 0) {
    try { glslCode = fs.readFileSync(path.join(dirPath, shaderFiles[0]), 'utf8') } catch { /* ignore */ }
  }

  const name = path.basename(dirPath)
  const id = `local-${name}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  return [{
    id,
    name,
    source: 'local',
    localPath: dirPath,
    description: `Local shader collection from ${dirPath}`,
    techStack: detectTechStack(tree, []),
    category: 'shader',
    tags: [],
    language: 'GLSL',
    fileTree: tree.slice(0, 100),
    glslCode: glslCode || '',
    score: 50,
    addedAt: new Date().toISOString(),
    lastScanned: new Date().toISOString(),
  }]
}

function detectTechStack(tree, topics) {
  const stack = new Set(topics)
  const joined = tree.join(' ')
  if (/\.glsl|\.frag|\.vert/.test(joined)) stack.add('glsl')
  if (/noise/.test(joined)) stack.add('noise')
  if (/raymarching|ray.march/.test(joined)) stack.add('ray-marching')
  if (/particle/.test(joined)) stack.add('particle')
  if (/shadertoy/i.test(joined)) stack.add('shadertoy')
  return [...stack]
}

function detectCategory(tree, topics, description) {
  const all = [...topics, description, tree.join(' ')].join(' ').toLowerCase()
  if (/raymarching|ray.march/.test(all)) return 'ray-marching'
  if (/noise|procedural/.test(all)) return 'noise'
  if (/particle/.test(all)) return 'particle'
  if (/shadertoy/.test(all)) return 'shader'
  return 'glsl'
}

function scoreTemplate(meta) {
  let score = 0
  const stars = meta.stargazers_count || 0
  score += Math.min(30, Math.log10(stars + 1) * 15)
  const updated = new Date(meta.updated_at || 0)
  const monthsAgo = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24 * 30)
  if (monthsAgo < 3) score += 25
  else if (monthsAgo < 6) score += 15
  else if (monthsAgo < 12) score += 5
  if (meta.license?.spdx_id && ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'].includes(meta.license.spdx_id)) score += 15
  if ((meta.description || '').length > 50) score += 10
  return Math.round(score)
}

function generateDefaultShader(name) {
  return `// ${name}
// Shadertoy-compatible shader

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
    fragColor = vec4(col, 1.0);
}
`
}

// --- AI Generation (streaming) ---

app.post('/api/generate', async (req, res) => {
  const { prompt, templates } = req.body
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const templateContext = templates?.length
    ? `\n\nReference shaders from the database:\n${templates.map(t =>
        `// ${t.name}\n${t.glslCode?.slice(0, 400) || '// (no code stored)'}`
      ).join('\n\n---\n\n')}`
    : ''

  const systemPrompt = `You are an expert GLSL shader programmer specializing in Shadertoy-compatible shaders.
Generate ONLY valid GLSL fragment shader code using the Shadertoy convention:
- Entry point: void mainImage(out vec4 fragColor, in vec2 fragCoord)
- Available uniforms: iTime (float), iResolution (vec3), iMouse (vec4), iFrame (int), iDate (vec4)
- Do NOT include a main() function
- Do NOT include any explanation, only pure GLSL code
- Start directly with comments or the function definition`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Generate a Shadertoy shader for: "${prompt}"${templateContext}`,
        }],
      }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue }
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify(event.delta.text)}\n\n`)
          }
        } catch { /* ignore parse errors */ }
      }
    }
    res.end()
  } catch (e) {
    res.write(`data: // Error: ${e.message}\n\n`)
    res.end()
  }
})

// --- Export ---

// Save shader to local db as a "local" template
app.post('/api/save-shader', (req, res) => {
  const { name, code, description } = req.body
  if (!name || !code) return res.status(400).json({ error: 'Missing name or code' })
  try {
    const db = readDB()
    const id = `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    db.templates[id] = {
      id,
      name,
      source: 'local',
      sourceUrl: '',
      description: description || '',
      techStack: ['glsl'],
      category: 'local',
      tags: [],
      language: 'GLSL',
      stars: 0,
      glslCode: code,
      score: 100,
      addedAt: new Date().toISOString(),
    }
    db.lastUpdated = new Date().toISOString()
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
    res.json({ ok: true, id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/export', (req, res) => {
  const { code, format, outputPath } = req.body
  try {
    if (format === 'glsl') {
      const p = outputPath || path.join(os.homedir(), 'Desktop', 'shader.glsl')
      fs.writeFileSync(p, code)
      res.json({ ok: true, path: p })
    } else if (format === 'html') {
      const p = outputPath || path.join(os.homedir(), 'Desktop', 'shader.html')
      fs.writeFileSync(p, buildHTMLExport(code))
      res.json({ ok: true, path: p })
    } else {
      res.status(400).json({ error: 'Unknown format' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function buildHTMLExport(glslCode) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Shader</title>
<style>*{margin:0;padding:0}body{background:#000}canvas{display:block;width:100vw;height:100vh}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const c = document.getElementById('c');
const gl = c.getContext('webgl');
const start = Date.now();
let frame = 0;

const vert = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vert, 'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}');
gl.compileShader(vert);

const fragSrc = \`precision highp float;
uniform vec3 iResolution;uniform float iTime;uniform int iFrame;uniform vec4 iMouse;
${glslCode}
void main(){vec4 c=vec4(0);mainImage(c,gl_FragCoord.xy);gl_FragColor=c;}\`;

const frag = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(frag, fragSrc);
gl.compileShader(frag);
if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
  document.body.innerHTML='<pre style="color:red;padding:20px">'+gl.getShaderInfoLog(frag)+'</pre>';
  throw new Error();
}

const prog = gl.createProgram();
gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const pos = gl.getAttribLocation(prog, 'p');

function render() {
  requestAnimationFrame(render);
  c.width = innerWidth; c.height = innerHeight;
  gl.viewport(0,0,c.width,c.height);
  gl.useProgram(prog);
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const t = (Date.now()-start)/1000;
  gl.uniform3f(gl.getUniformLocation(prog,'iResolution'),c.width,c.height,1);
  gl.uniform1f(gl.getUniformLocation(prog,'iTime'),t);
  gl.uniform1i(gl.getUniformLocation(prog,'iFrame'),frame++);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
render();
<\/script>
</body>
</html>`
}

// --- Shadertoy proxy (uses server-side API key) ---

app.get('/api/shadertoy/:id', async (req, res) => {
  const apiKey = process.env.SHADERTOY_API_KEY
  if (!apiKey) {
    return res.status(400).json({
      error: 'No Shadertoy API key. Add SHADERTOY_API_KEY to .env — get one free at shadertoy.com (Profile → Apps)',
    })
  }
  try {
    const r = await fetch(`https://www.shadertoy.com/api/v1/shaders/${req.params.id}?key=${apiKey}`, {
      headers: { 'User-Agent': 'ShaderForge/1.0' },
    })
    const text = await r.text()
    if (!r.ok || text.startsWith('Bad')) throw new Error(`Shadertoy API error: ${text}`)
    const data = JSON.parse(text)
    if (data.Error) throw new Error(`Shadertoy: ${data.Error}`)
    const passes = data.Shader?.renderpass || []
    const imagePass = passes.find(p => p.type === 'image') || passes[0]
    if (!imagePass?.code) throw new Error('No GLSL code found')
    res.json({ code: imagePass.code, source: `Shadertoy #${req.params.id}` })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// --- URL Fetch (load shader from any URL) ---

app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    let code = ''
    let source = ''

    // Shadertoy: https://www.shadertoy.com/view/XXXXXX
    // NOTE: Shadertoy API is behind Cloudflare — must be fetched client-side
    const shadertoyMatch = url.match(/shadertoy\.com\/view\/([A-Za-z0-9]+)/)
    if (shadertoyMatch) {
      throw new Error('SHADERTOY_CLIENT_SIDE:' + shadertoyMatch[1])

    // GitHub blob URL: github.com/owner/repo/blob/branch/path/file.glsl
    } else if (url.includes('github.com') && url.includes('/blob/')) {
      const rawUrl = url
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
      const r = await fetch(rawUrl)
      if (!r.ok) throw new Error(`GitHub fetch failed: ${r.status}`)
      code = await r.text()
      source = 'GitHub'

    // raw.githubusercontent.com or any direct .glsl/.frag/.vert URL
    } else if (
      url.includes('raw.githubusercontent.com') ||
      /\.(glsl|frag|vert|fs|vs)(\?.*)?$/.test(url)
    ) {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Fetch failed: ${r.status}`)
      code = await r.text()
      source = 'URL'

    // Generic URL — try to extract GLSL from page text
    } else {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!r.ok) throw new Error(`Fetch failed: ${r.status}`)
      const text = await r.text()
      // Try to extract code between common GLSL markers
      const glslMatch = text.match(/void\s+mainImage\s*\([^)]*\)\s*\{[\s\S]+?\n\}/)
        || text.match(/void\s+main\s*\(\s*\)\s*\{[\s\S]+?\n\}/)
      if (!glslMatch) throw new Error('No GLSL code found at this URL. Try a direct .glsl file or Shadertoy link.')
      code = glslMatch[0]
      source = 'URL (extracted)'
    }

    res.json({ code, source })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// --- Rewrite (AI remix of loaded shader) ---

app.post('/api/rewrite', async (req, res) => {
  const { code, prompt } = req.body
  if (!code || !prompt) return res.status(400).json({ error: 'Missing code or prompt' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const systemPrompt = `You are an expert GLSL shader programmer.
The user will give you an existing Shadertoy-compatible shader and a rewrite instruction.
Rewrite the shader according to the instruction while preserving its overall structure.
Rules:
- Keep void mainImage(out vec4 fragColor, in vec2 fragCoord) as the entry point
- Use only: iTime, iResolution, iMouse, iFrame, iDate uniforms
- Do NOT include main() function
- Return ONLY pure GLSL code, no explanation, no markdown`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        stream: true,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Original shader:\n\`\`\`glsl\n${code}\n\`\`\`\n\nRewrite instruction: "${prompt}"`,
        }],
      }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue }
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify(event.delta.text)}\n\n`)
          }
        } catch { /* ignore */ }
      }
    }
    res.end()
  } catch (e) {
    res.write(`data: // Error: ${e.message}\n\n`)
    res.end()
  }
})

// ─── /api/adapt  (Shader Adapter Pattern – AI pass) ─────────────────────────
// Applies the full 4-layer Shader Adapter Pattern to make arbitrary Shadertoy
// code run in ShaderForge / WebGL2:
//   Layer 1 – Keep Core Visual Logic intact
//   Layer 2 – Compatibility Adapter (syntax / API differences)
//   Layer 3 – Runtime Input Adapter (uniforms already provided by host)
//   Layer 4 – Stability Pass (divide-by-zero guards, clamp, etc.)
app.post('/api/adapt', async (req, res) => {
  const { code, errors } = req.body
  if (!code) return res.status(400).json({ error: 'Missing code' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const systemPrompt = `You are an expert GLSL shader porter. Your task is to adapt a Shadertoy shader to run in WebGL2 (GLSL ES 3.00) using the following 4-layer methodology:

## Layer 1 – Core Visual Logic
Keep the math intact: map(), noise(), fbm(), raymarch loop, lighting, normals, reflections.
Do NOT change what the shader draws. Only change how it runs.

## Layer 2 – Compatibility Adapter
Fix syntax that doesn't work in GLSL ES 3.00:
- Entry point must be: void mainImage(out vec4 fragColor, in vec2 fragCoord)
- Fix code-golf for-loops: for(float t=0.,i=0.;...) → hoist declarations, use for(int i=0;i<N;i++) where the bound is constant, or keep float loop with a simple init
- Replace textureLod(s,uv,lod) → texture(s,uv)
- Replace textureGrad(s,uv,d,d) → texture(s,uv)
- Replace any non-standard built-ins with inline equivalents
- tanh(vec4) → apply per-component manually if needed

## Layer 3 – Runtime Input Adapter
These uniforms are already provided by the host — do NOT redeclare them:
  uniform vec3  iResolution;
  uniform float iTime;
  uniform float iTimeDelta;
  uniform int   iFrame;
  uniform vec4  iMouse;
  uniform vec4  iDate;

If the shader uses iChannelN (textures), replace with procedural noise or a neutral grey (vec4(0.5)).
Do NOT add sampler2D or samplerCube — they won't be bound.

## Layer 4 – Stability Pass
Add guards for:
- Divide by zero: max(x, 0.0001)
- log(0): log(max(x, 0.0001))
- normalize(vec3(0)): normalize(v + vec3(1e-5))
- Raymarch step blowup: clamp step size

## Output Rules
- Return ONLY pure GLSL code — no markdown, no explanation, no \`\`\`
- Keep void mainImage(out vec4 fragColor, in vec2 fragCoord) as the entry point
- Do NOT include main() or any #version directive
- Do NOT include precision declarations
- Do NOT redeclare any iXxx uniform`

  const errorContext = errors?.length
    ? `\n\nCurrent compile errors (use these as hints for what to fix):\n${errors.map(e => `L${e.line}: ${e.message}`).join('\n')}`
    : ''

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Adapt this shader:\n\`\`\`glsl\n${code}\n\`\`\`${errorContext}`,
        }],
      }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue }
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify(event.delta.text)}\n\n`)
          }
        } catch { /* ignore */ }
      }
    }
    res.end()
  } catch (e) {
    res.write(`data: // Error: ${e.message}\n\n`)
    res.end()
  }
})

// In production, catch-all for SPA routing
if (isProd) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`ShaderForge server on http://localhost:${PORT}`))
