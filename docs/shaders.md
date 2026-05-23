# Shader System

Six block types use custom GLSL shaders for animated effects. All shader source lives in [`shaders/index.ts`](../shaders/index.ts) as exported template strings — there are no per-file `.frag` assets.

## Current Shaders

| Block            | Shader key       | Effect |
|------------------|------------------|--------|
| Toxic Core       | `pulse-core`     | Pulsing energy core |
| Neural Node      | `pulse-core`     | Same as Toxic Core |
| Holo Billboard   | `holo`           | Scrolling holographic scanlines |
| Data Stream      | `data-waterfall` | Flowing liquid bandwidth |
| Glitch Zone      | `glitch`         | Chromatic break + jitter |
| Circuit Plate    | `circuit`        | PCB trace flow animation |

## How Shaders Work

All shaders receive a shared `uTime` uniform (updated once per frame in `components/scene/Voxels.tsx`) and per-block `uColor` + `uEmissive`.

Example structure (from `shaders/index.ts`):

```glsl
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEmissive;

void main() {
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    vec3 finalColor = mix(uColor, uEmissive, pulse);
    gl_FragColor = vec4(finalColor, 1.0);
}
```

## Adding a New Shader

1. Add GLSL template exports to `shaders/index.ts`
2. Register the key in `engine/bridge/RenderBridge.ts` → `buildShaderMaterial` switch
3. Assign `shader: 'my-shader'` in the block definition in `lib/blocks.ts`

---

*Shaders are one of the most visually distinctive parts of the project.*
