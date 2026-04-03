import { useEffect, useRef, useCallback } from 'react'
import { VERTEX_SHADER, buildFragmentShader } from './shadertoyUniforms'
import type { ShaderError } from '../../types'

interface UseShaderProgramOptions {
  code: string
  compileKey: number
  onErrors: (errors: ShaderError[]) => void
}

export interface ShaderControls {
  pause: () => void
  resume: () => void
  resetTime: () => void
  isPaused: () => boolean
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): [WebGLShader | null, string] {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    return [null, log]
  }
  return [shader, '']
}

function parseErrors(log: string, preambleLines: number): ShaderError[] {
  return log.split('\n')
    .filter(l => /ERROR:/i.test(l))
    .map(l => {
      const m = l.match(/ERROR:\s*\d+:(\d+):\s*(.+)/i)
      if (!m) return null
      return { line: Math.max(1, parseInt(m[1]) - preambleLines), message: m[2].trim() }
    })
    .filter(Boolean) as ShaderError[]
}

export function useShaderProgram(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  { code, compileKey, onErrors }: UseShaderProgramOptions
): ShaderControls {
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(Date.now())
  const pausedAtRef = useRef<number | null>(null)   // non-null = paused, stores the epoch when paused
  const frameRef = useRef<number>(0)
  // iMouse: xy = current pos (flipped Y), zw = click pos (negative when not pressed)
  const mouseRef = useRef<[number, number, number, number]>([0, 0, 0, 0])
  const onErrorsRef = useRef(onErrors)
  onErrorsRef.current = onErrors

  // Stable controls object
  const controls: ShaderControls = {
    pause: () => {
      if (pausedAtRef.current === null) pausedAtRef.current = Date.now()
    },
    resume: () => {
      if (pausedAtRef.current !== null) {
        startTimeRef.current += Date.now() - pausedAtRef.current
        pausedAtRef.current = null
      }
    },
    resetTime: () => {
      startTimeRef.current = Date.now()
      frameRef.current = 0
      if (pausedAtRef.current !== null) pausedAtRef.current = Date.now()
    },
    isPaused: () => pausedAtRef.current !== null,
  }

  const buildProgram = useCallback((gl: WebGL2RenderingContext, userCode: string) => {
    const fragSrc = buildFragmentShader(userCode)
    const userFirstLine = userCode.trim().split('\n')[0].trim()
    const fragLines = fragSrc.split('\n')
    let preambleLines = fragLines.findIndex(l => l.trim() === userFirstLine)
    if (preambleLines < 0) preambleLines = fragLines.findIndex(l => l.includes('uniform')) + 6

    const [vert, vertLog] = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const [frag, fragLog] = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)

    if (!vert) { console.error('Vertex shader error:', vertLog); return null }
    if (!frag) {
      console.error('Fragment shader error:', fragLog)
      const errs = parseErrors(fragLog, preambleLines)
      onErrorsRef.current(errs.length > 0 ? errs : [{ line: 1, message: fragLog }])
      return null
    }

    const prog = gl.createProgram()!
    gl.attachShader(prog, vert)
    gl.attachShader(prog, frag)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      onErrorsRef.current([{ line: 1, message: gl.getProgramInfoLog(prog) ?? 'Link error' }])
      return null
    }
    onErrorsRef.current([])
    return prog
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2')
    if (!gl) return
    glRef.current = gl

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    // iMouse Shadertoy semantics:
    // xy = current mouse position (Y flipped)
    // z  = click X (positive while pressed, negative = abs value of last click X when released)
    // w  = click Y (same sign convention)
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = r.height - (e.clientY - r.top)
      mouseRef.current[0] = x
      mouseRef.current[1] = y
    }
    const onDown = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = r.height - (e.clientY - r.top)
      mouseRef.current = [x, y, x, y]
    }
    const onUp = () => {
      mouseRef.current[2] = -Math.abs(mouseRef.current[2])
      mouseRef.current[3] = -Math.abs(mouseRef.current[3])
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mouseup', onUp)

    const render = () => {
      rafRef.current = requestAnimationFrame(render)
      const prog = programRef.current
      if (!prog) return
      if (pausedAtRef.current !== null) return   // paused — keep last frame

      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth
        canvas.height = canvas.clientHeight
        gl.viewport(0, 0, canvas.width, canvas.height)
      }

      gl.useProgram(prog)
      const pos = gl.getAttribLocation(prog, 'position')
      gl.enableVertexAttribArray(pos)
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

      const t = (Date.now() - startTimeRef.current) / 1000
      gl.uniform3f(gl.getUniformLocation(prog, 'iResolution'), canvas.width, canvas.height, 1)
      gl.uniform1f(gl.getUniformLocation(prog, 'iTime'), t)
      gl.uniform1f(gl.getUniformLocation(prog, 'iTimeDelta'), 1 / 60)
      gl.uniform1i(gl.getUniformLocation(prog, 'iFrame'), frameRef.current++)
      gl.uniform4fv(gl.getUniformLocation(prog, 'iMouse'), mouseRef.current)
      const now = new Date()
      gl.uniform4f(gl.getUniformLocation(prog, 'iDate'),
        now.getFullYear(), now.getMonth(), now.getDate(),
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
      )
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mouseup', onUp)
    }
  }, [canvasRef])

  useEffect(() => {
    const gl = glRef.current
    if (!gl) return
    const delay = compileKey > 0 ? 0 : 400
    const t = setTimeout(() => {
      const prog = buildProgram(gl, code)
      if (prog) programRef.current = prog
    }, delay)
    return () => clearTimeout(t)
  }, [code, compileKey, buildProgram])

  return controls
}
