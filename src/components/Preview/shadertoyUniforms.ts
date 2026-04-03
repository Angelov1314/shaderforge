// Shadertoy-compatible vertex shader (GLSL ES 3.00 / WebGL2)
export const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// ─── Static Compatibility Adapter ────────────────────────────────────────────
// Applies the safe, deterministic transforms from the Shader Adapter Pattern.
// These handle the most common Shadertoy → WebGL2 friction without touching
// the visual core.
function applyCompatAdapter(code: string): string {
  let c = code

  // 1. Strip version directives — we supply our own
  c = c.replace(/^\s*#version\s+.*$/gm, '')

  // 2. textureLod(s, uv, lod) → texture(s, uv)  [no mipmaps in ShaderForge]
  c = c.replace(/\btextureLod\s*\(\s*(\w+)\s*,\s*([^,]+),\s*[^)]+\)/g, 'texture($1, $2)')

  // 3. textureGrad(s, uv, dx, dy) → texture(s, uv)
  c = c.replace(/\btextureGrad\s*\(\s*(\w+)\s*,\s*([^,]+)(?:,\s*[^,)]+){2}\)/g, 'texture($1, $2)')

  // 4. Code-golf multi-declaration for-loop init:
  //    for(float t=0.,i=0.; cond; incr)
  //    → float t=0.,i=0.;\nfor(; cond; incr)
  //    Hoist declarations before the loop (outer-scope, safe for GLSL).
  c = c.replace(
    /for\s*\(\s*((?:float|int|uint)\s+\w+\s*=[^;]+(?:,\s*\w+\s*=[^;]+)+)\s*;/g,
    (_match, inits) => {
      // "float t=0.,i=0." → keep as-is (already has type), just add semicolon and newline
      return `${inits};\nfor(;`
    }
  )

  // 5. Inject tanh polyfill if the shader uses tanh on vector types
  //    (WebGL2 only has tanh(float/genType) — it should work, but some drivers miss it)
  if (/\btanh\s*\(/.test(c)) {
    const polyfill = `// tanh polyfill (driver safety)
#ifndef tanh_patched
#define tanh_patched
float _tanh(float x){float e=exp(2.0*x);return(e-1.0)/(e+1.0);}
vec2  _tanh(vec2  x){vec2  e=exp(2.0*x);return(e-1.0)/(e+1.0);}
vec3  _tanh(vec3  x){vec3  e=exp(2.0*x);return(e-1.0)/(e+1.0);}
vec4  _tanh(vec4  x){vec4  e=exp(2.0*x);return(e-1.0)/(e+1.0);}
#define tanh _tanh
#endif
`
    c = polyfill + c
  }

  return c
}

// ─── Fragment Shader Builder ──────────────────────────────────────────────────
// Wraps user mainImage() in a full GLSL ES 3.00 fragment shader.
export function buildFragmentShader(userCode: string): string {
  // Strip precision + duplicate uniform declarations from pasted Shadertoy code
  const stripped = userCode
    .replace(/^\s*precision\s+\w+\s+\w+\s*;\s*$/gm, '')
    .replace(/^\s*uniform\s+(vec[234]|float|int|sampler\w*)\s+i(Resolution|Time|TimeDelta|Frame|Mouse|Date|Channel\d)\s*;\s*$/gm, '')

  const adapted = applyCompatAdapter(stripped)

  return `#version 300 es
precision highp float;

uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
uniform vec4  iDate;

out vec4 _fragOut;

${adapted}

void main() {
  vec4 fragColor = vec4(0.0);
  mainImage(fragColor, gl_FragCoord.xy);
  _fragOut = fragColor;
}
`
}
