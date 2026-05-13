# How to Extend Obsidian Protocol

This guide explains how to add new features, blocks, UI elements, and effects while maintaining the existing architecture.

---

## Adding a New Block Type

1. Open `lib/blocks.ts`
2. Add a new entry to `BLOCK_TYPES`:

```ts
'my-new-block': {
  id: 'my-new-block',
  name: 'My New Block',
  loreName: 'Whatever the lore name is',
  description: 'Description here',
  category: 'data', // structure | neon | energy | data | anomaly
  color: '#ff00aa',
  emissive: '#ff00aa',
  emissiveIntensity: 2.8,
  stability: 0.75,
  anomaly: 0.1,
  metalness: 0.3,
  roughness: 0.4,
  shader: 'pulse-core', // optional
},
```

3. Add it to `BLOCK_ORDER` array
4. (Optional) Create a new shader in `shaders/` if needed

---

## Adding a New UI Panel

1. Create `components/ui/MyNewPanel.tsx`
2. Follow the existing pattern (use `panel` class from globals.css)
3. Add state in `uiStore.ts` under `panels`
4. Import and render it in `App.tsx`

---

## Adding New Keyboard Shortcuts

Edit `hooks/useKeyboardShortcuts.ts` and add your key handler:

```ts
if (e.code === 'KeyX') {
  // your action
  return;
}
```

---

## Modifying the Voxel Engine

The core logic lives in:
- `stores/voxelStore.ts` — data + history
- `components/scene/Voxels.tsx` — rendering
- `lib/brush.ts` — brush behavior

Most changes can be made without touching the rendering layer.

---

## Performance Tips

- Keep particle count under 360
- Use shared uniforms for shaders
- Be careful with frequent store updates inside `useFrame`
- Test with Quality preset = PERFORMANCE

---

*This document will grow as we add more features.*