// Platform abstraction layer — web vs Tauri
// To migrate to Tauri: swap webAdapter for tauriAdapter here

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

const webAdapter = {
  async readFile(path: string): Promise<string> {
    const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`Read failed: ${res.statusText}`)
    return res.text()
  },
  async writeFile(path: string, content: string): Promise<void> {
    const res = await fetch('/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error(`Write failed: ${res.statusText}`)
  },
  async runCommand(cmd: string, args: string[]): Promise<string> {
    const res = await fetch('/api/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, args }),
    })
    if (!res.ok) throw new Error(`Command failed: ${res.statusText}`)
    const data = await res.json()
    return data.output
  },
}

// Tauri adapter (Phase 4) — same interface, different implementation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tauriAdapter = {
  async readFile(path: string): Promise<string> {
    // @ts-expect-error — tauri types added in Phase 4
    const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api/tauri')
    return invoke('read_file', { path })
  },
  async writeFile(path: string, content: string): Promise<void> {
    // @ts-expect-error — tauri types added in Phase 4
    const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api/tauri')
    return invoke('write_file', { path, content })
  },
  async runCommand(cmd: string, args: string[]): Promise<string> {
    // @ts-expect-error — tauri types added in Phase 4
    const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api/tauri')
    return invoke('run_command', { cmd, args })
  },
}

export const platform = isTauri ? tauriAdapter : webAdapter
