'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { SETTINGS_PRESETS } from '@/lib/settingsPresets';
import type { QualityPreset } from '@/types';

const QUALITY_PRESETS: Array<{ id: QualityPreset; label: string; tip: string }> = [
  { id: 'high',        label: 'HIGH',        tip: 'Full bloom + chromatic + scanlines + drones.' },
  { id: 'balanced',    label: 'BALANCED',    tip: 'Reduced bloom kernel, no scanlines, fewer drones.' },
  { id: 'performance', label: 'PERFORMANCE', tip: 'Minimal postprocessing, fewest drones, no shimmer.' },
];

// Accent options from the Obsidian Protocol design handoff.
const ACCENTS: Array<{ hex: string; name: string }> = [
  { hex: '#38e1ff', name: 'Azure' },
  { hex: '#ff2e88', name: 'Crimson' },
  { hex: '#ffb547', name: 'Amber' },
  { hex: '#5cff8a', name: 'Toxic' },
  { hex: '#a25cff', name: 'Violet' },
];

export function SettingsPanel() {
  const open = useUIStore((s) => s.panels.settings);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const scene = useUIStore((s) => s.scene);
  const setScene = useUIStore((s) => s.setScene);
  const renderer = useUIStore((s) => s.rendererMode);
  const setRenderer = useUIStore((s) => s.setRendererMode);
  const immersiveMode = useUIStore((s) => s.immersiveMode);
  const setImmersiveMode = useUIStore((s) => s.setImmersiveMode);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const activeSettingsPreset = useUIStore((s) => s.activeSettingsPreset);
  const applySettingsPreset = useUIStore((s) => s.applySettingsPreset);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute top-16 bottom-12 right-4 z-30 panel w-80 corner-bracket flex flex-col min-h-0"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-cyan-neon/20 flex-shrink-0">
            <span className="terminal text-xs neon-text-cyan">// SCENE PARAMS</span>
            <button
              className="terminal text-[10px] text-cyan-glow/70 hover:text-cyan-neon"
              onClick={() => togglePanel('settings')}
            >
              [ HIDE ]
            </button>
          </header>
          <div className="overflow-y-auto flex-1 min-h-0 p-3 space-y-3">
            <div>
              <div className="terminal text-[10px] neon-text-cyan mb-1">// PRESETS</div>
              <div className="terminal text-[9px] text-cyan-glow/45 mb-1.5">
                Presets configure scene + UI theme together. Fine-tune below.
              </div>
              <div className="grid grid-cols-4 gap-1">
                {SETTINGS_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="btn-neon !text-[10px]"
                    data-active={activeSettingsPreset === p.id}
                    onClick={() => applySettingsPreset(p.id)}
                    title={p.tip}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-cyan-neon/15" />
            {/* Immersive Mode */}
            <div>
              <Toggle
                label="IMMERSIVE MODE"
                value={immersiveMode}
                onChange={setImmersiveMode}
              />
              <div className="terminal text-[9px] text-cyan-glow/45 mt-1">
                Enables integrity meter, anomaly alerts, and contract panel. Off by default.
              </div>
            </div>
            <div className="border-t border-cyan-neon/15" />
            {/* Interface — live design tokens */}
            <div className="space-y-2.5">
              <div className="terminal text-[10px] neon-text-cyan">// INTERFACE</div>
              <div className="terminal text-[9px] text-cyan-glow/45">
                UI accent recolors panels and HUD — not voxel blocks. Block types are chosen in Block Matrix.
              </div>
              <div>
                <div className="terminal text-[10px] text-cyan-glow/60 mb-1">ACCENT</div>
                <div className="flex gap-1.5">
                  {ACCENTS.map(({ hex, name }) => {
                    const active = theme.accent.toLowerCase() === hex.toLowerCase();
                    return (
                      <button
                        key={hex}
                        title={`${name} — ${hex}`}
                        onClick={() => setTheme({ accent: hex })}
                        className="flex-1 h-7 transition-transform hover:scale-105"
                        style={{
                          background: hex,
                          border: `${active ? 2 : 1}px solid ${active ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
                          boxShadow: active ? `0 0 12px ${hex}` : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="terminal text-[10px] text-cyan-glow/60 mb-1">CHROME</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['minimal', 'full'] as const).map((m) => (
                      <button
                        key={m}
                        className="btn-neon !text-[10px]"
                        data-active={theme.chrome === m}
                        onClick={() => setTheme({ chrome: m })}
                        title={m === 'minimal' ? 'Fainter panel borders.' : 'Full-strength borders.'}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="terminal text-[10px] text-cyan-glow/60 mb-1">DENSITY</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['compact', 'regular'] as const).map((m) => (
                      <button
                        key={m}
                        className="btn-neon !text-[10px]"
                        data-active={theme.density === m}
                        onClick={() => setTheme({ density: m })}
                        title={m === 'compact' ? 'Tighter padding + row height.' : 'Default spacing.'}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Toggle
                label="HIGH CONTRAST"
                value={theme.contrast === 'high'}
                onChange={(v) => setTheme({ contrast: v ? 'high' : 'normal' })}
              />
              <div className="terminal text-[9px] text-cyan-glow/45">
                Opaque panels, brighter text, borders, no scanlines. For low-vision / glare.
              </div>
            </div>
            <div className="border-t border-cyan-neon/15" />
            {/* Quality preset */}
            <div>
              <div className="terminal text-[10px] text-cyan-glow/60 mb-1">QUALITY PRESET</div>
              <div className="grid grid-cols-3 gap-1">
                {QUALITY_PRESETS.map((q) => (
                  <button
                    key={q.id}
                    className="btn-neon !text-[10px]"
                    data-active={scene.quality === q.id}
                    onClick={() => setScene({ quality: q.id })}
                    title={q.tip}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="terminal text-[9px] text-cyan-glow/45 mt-1">
                {scene.autoDegrade ? 'Auto-degrades when FPS sustains below 38.' : 'Manual quality — auto-degrade disabled.'}
              </div>
            </div>

            <Toggle label="AUTO-DEGRADE ON FPS DROP" value={scene.autoDegrade} onChange={(v) => setScene({ autoDegrade: v })} />
            <Toggle label="SHOW FPS COUNTER" value={scene.showFps} onChange={(v) => setScene({ showFps: v })} />

            <div className="border-t border-cyan-neon/15 pt-2 space-y-2.5">
              <Slider
                label="BLOOM"
                value={scene.bloomIntensity}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(v) => setScene({ bloomIntensity: v })}
              />
              <Slider
                label="CHROMATIC ABERRATION"
                value={scene.chromaticAberration}
                min={0}
                max={0.008}
                step={0.0002}
                format={(v) => v.toFixed(4)}
                onChange={(v) => setScene({ chromaticAberration: v })}
              />
              <Slider
                label="AMBIENT DRONES"
                value={scene.ambientDrones}
                min={0}
                max={64}
                step={1}
                onChange={(v) => setScene({ ambientDrones: Math.round(v) })}
              />
              <Slider
                label="AUDIO VOLUME"
                value={scene.volume}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setScene({ volume: v })}
              />
              <Toggle label="MUTE AUDIO (M)" value={scene.muted} onChange={(v) => setScene({ muted: v })} />
              <Toggle label="SCANLINE NOISE" value={scene.scanlines} onChange={(v) => setScene({ scanlines: v })} />
              <Toggle label="VIGNETTE" value={scene.vignette} onChange={(v) => setScene({ vignette: v })} />
              <Toggle label="GLITCH" value={scene.glitchEffect} onChange={(v) => setScene({ glitchEffect: v })} />
              <Toggle label="CINEMATIC AUTO-ROTATE" value={scene.cinematic} onChange={(v) => setScene({ cinematic: v })} />
            </div>

            <div className="border-t border-cyan-neon/15 pt-2">
              <div className="terminal text-[10px] text-cyan-glow/60 mb-1">RENDERER MODE</div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  className="btn-neon"
                  data-active={renderer === 'webgl'}
                  onClick={() => setRenderer('webgl')}
                >
                  WEBGL2
                </button>
                <button
                  className="btn-neon"
                  data-active={renderer === 'webgpu'}
                  title="WebGPU is experimental in this build — falls back to WebGL2 if unsupported."
                  onClick={() => setRenderer('webgpu')}
                >
                  WEBGPU<span className="ml-1 text-magenta-glow">β</span>
                </button>
              </div>
              <div className="terminal text-[9px] text-cyan-glow/45 mt-1">
                Live switching requires a refresh. WebGPU path is roadmap.
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between terminal text-[10px] text-cyan-glow/85">
        <span>{label}</span>
        <span className="neon-text-cyan">{(format ?? ((v: number) => v.toFixed(2)))(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-neon h-1"
      />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full terminal text-[10px] text-cyan-glow/85 hover:text-cyan-neon"
    >
      <span>{label}</span>
      <span
        className="px-2 py-0.5 border"
        style={{
          borderColor: value ? 'rgba(0,249,255,0.7)' : 'rgba(0,249,255,0.2)',
          background: value ? 'rgba(0,249,255,0.15)' : 'transparent',
          color: value ? '#aef9ff' : 'rgba(174, 249, 255, 0.4)',
        }}
      >
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
