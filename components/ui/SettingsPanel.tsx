'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import type { QualityPreset } from '@/types';

const QUALITY_PRESETS: Array<{ id: QualityPreset; label: string; tip: string }> = [
  { id: 'high',        label: 'HIGH',        tip: 'Full bloom + chromatic + scanlines + drones.' },
  { id: 'balanced',    label: 'BALANCED',    tip: 'Reduced bloom kernel, no scanlines, fewer drones.' },
  { id: 'performance', label: 'PERFORMANCE', tip: 'Minimal postprocessing, fewest drones, no shimmer.' },
];

export function SettingsPanel() {
  const open = useUIStore((s) => s.panels.settings);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const scene = useUIStore((s) => s.scene);
  const setScene = useUIStore((s) => s.setScene);
  const renderer = useUIStore((s) => s.rendererMode);
  const setRenderer = useUIStore((s) => s.setRendererMode);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute bottom-12 right-4 z-30 panel w-80 corner-bracket"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-cyan-neon/20">
            <span className="terminal text-xs neon-text-cyan">// SCENE PARAMS</span>
            <button
              className="terminal text-[10px] text-cyan-glow/70 hover:text-cyan-neon"
              onClick={() => togglePanel('settings')}
            >
              [ HIDE ]
            </button>
          </header>
          <div className="p-3 space-y-3">
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
