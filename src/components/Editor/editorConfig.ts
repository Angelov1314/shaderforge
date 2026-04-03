import type * as Monaco from 'monaco-editor'

export function registerGLSL(monaco: typeof Monaco) {
  // Register GLSL language
  monaco.languages.register({ id: 'glsl' })

  monaco.languages.setMonarchTokensProvider('glsl', {
    keywords: [
      'attribute', 'const', 'uniform', 'varying', 'break', 'continue', 'do', 'for', 'while',
      'if', 'else', 'in', 'out', 'inout', 'float', 'int', 'uint', 'void', 'bool', 'true', 'false',
      'lowp', 'mediump', 'highp', 'precision', 'invariant', 'discard', 'return',
      'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4',
      'mat4x2', 'mat4x3', 'mat4x4',
      'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4',
      'uvec2', 'uvec3', 'uvec4',
      'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DShadow', 'samplerCubeShadow',
      'struct',
    ],
    builtins: [
      'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
      'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
      'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
      'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract', 'mod', 'modf',
      'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'isnan', 'isinf',
      'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract',
      'texture', 'texture2D', 'textureCube',
      'gl_FragCoord', 'gl_FragColor', 'gl_Position',
    ],
    shadertoyUniforms: [
      'iTime', 'iResolution', 'iMouse', 'iFrame', 'iTimeDelta', 'iDate',
      'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3',
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'type.identifier',
            '@shadertoyUniforms': 'variable.predefined',
            '@default': 'identifier',
          }
        }],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/\d+\.\d*([eE][+-]?\d+)?/, 'number.float'],
        [/\d+([eE][+-]?\d+)?/, 'number'],
        [/[{}()\[\]]/, 'delimiter.bracket'],
        [/[;,.]/, 'delimiter'],
        [/[+\-*\/%=!<>&|^~?:]/, 'operator'],
        [/".*?"/, 'string'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  })

  monaco.editor.defineTheme('shaderforge-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '4ec9b0' },
      { token: 'variable.predefined', foreground: 'dcdcaa' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'number.float', foreground: 'b5cea8' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'operator', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#0d0d0d',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#3a3a3a',
      'editorLineNumber.activeForeground': '#858585',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#161616',
      'editorCursor.foreground': '#aeafad',
    },
  })
}

export const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  language: 'glsl',
  theme: 'shaderforge-dark',
  fontSize: 13,
  fontFamily: "'Fira Code', 'SF Mono', 'Cascadia Code', monospace",
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbers: 'on',
  renderLineHighlight: 'line',
  tabSize: 4,
  wordWrap: 'off',
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  smoothScrolling: true,
}
