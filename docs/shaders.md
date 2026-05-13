# Shader System

Six block types use custom GLSL shaders for animated effects:

## Current Shaders

| Block            | Shader File              | Effect |
|------------------|--------------------------|--------|
| Toxic Core       | `pulse-core`             | Pulsing energy core |
| Neural Node      | `pulse-core`             | Same as Toxic Core |
| Holo Billboard   | `holo`                   | Scrolling holographic scanlines |
| Data Stream      | `data-waterfall`         | Flowing liquid bandwidth |
| Glitch Zone      | `glitch`                 | Chromatic break + jitter |
| Circuit Plate    | `circuit`                | PCB trace flow animation |

## How Shaders Work

All shaders receive a shared `uTime` uniform (updated once per frame) and per-block `uColor` + `uEmissive`.

Example structure (`shaders/toxic-core.frag`):

```glsl
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEmissive;

void main() {
    // animated pulse logic
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    vec3 finalColor = mix(uColor, uEmissive, pulse);
    gl_FragColor = vec4(finalColor, 1.0);
}
```

## Adding a New Shader

1. Create `shaders/my-shader.frag` and `.vert` (if needed)
2. Register it in `Voxels.tsx` → `buildShaderMaterial`
3. Assign `shader: 'my-shader'` in the block definition

---

*Shaders are one of the most visually distinctive parts of the project.*