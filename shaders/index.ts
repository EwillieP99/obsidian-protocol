// GLSL shader source strings used as drop-in `onBeforeCompile` patches and full custom materials.

export const PULSE_CORE_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const PULSE_CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    float pulse = 0.55 + 0.45 * sin(uTime * 2.2 + vWorldPos.x * 0.6 + vWorldPos.z * 0.6 + vWorldPos.y * 1.1);
    float fres = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0,0.0,1.0)), 0.0), 2.0);
    vec3 base = uColor * (0.18 + 0.25 * pulse);
    vec3 glow = uEmissive * (1.4 + 2.0 * pulse) + uEmissive * fres * 1.3;
    gl_FragColor = vec4(base + glow, 1.0);
  }
`;

export const HOLO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    // Vertical scanlines plus horizontal data scroll
    float scan = step(0.5, fract(vWorldPos.y * 8.0 - uTime * 1.2));
    float scroll = 0.5 + 0.5 * sin(vWorldPos.y * 24.0 - uTime * 6.0);
    float flick = step(0.97, fract(sin(uTime * 12.0) * 43758.5453));
    vec3 col = mix(uColor * 0.3, uEmissive * 1.6, scan * 0.7 + scroll * 0.5);
    col += uEmissive * flick * 1.2;
    gl_FragColor = vec4(col, 0.92);
  }
`;

export const DATA_WATERFALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  // Cheap pseudo-noise using sine hash
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float t = uTime * 1.4;
    float band = fract(vWorldPos.y * 6.0 - t);
    float pulse = smoothstep(0.0, 0.4, band) * smoothstep(1.0, 0.6, band);
    float drip = hash(floor(vWorldPos.xz * 3.0));
    float drift = 0.5 + 0.5 * sin(t * (1.0 + drip * 2.0) + drip * 6.28);
    vec3 col = uColor * 0.15 + uEmissive * (0.8 + 1.6 * pulse) * drift;
    gl_FragColor = vec4(col, 0.9);
  }
`;

export const GLITCH_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float n = hash(floor(vWorldPos.xz * 4.0) + floor(uTime * 16.0));
    float bar = step(0.85, fract(vWorldPos.y * 12.0 + uTime * 0.3 + n));
    float jitter = step(0.92, hash(floor(vWorldPos.xy * 18.0 + uTime * 30.0)));
    vec3 col = mix(uColor * 0.4, vec3(1.0, 0.1, 0.3), bar);
    col += uEmissive * (1.2 + jitter * 2.0);
    if (jitter > 0.5) col.gb *= 0.4; // chromatic break
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const CIRCUIT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec2 p = vWorldPos.xz;
    // Simulated PCB traces via grid lines
    float gx = abs(fract(p.x * 4.0) - 0.5);
    float gy = abs(fract(p.y * 4.0) - 0.5);
    float trace = smoothstep(0.04, 0.0, min(gx, gy));
    float flow = 0.5 + 0.5 * sin(p.x * 4.0 - uTime * 4.0);
    vec3 col = uColor * 0.5 + uEmissive * (trace * (0.8 + 0.8 * flow));
    gl_FragColor = vec4(col, 1.0);
  }
`;
