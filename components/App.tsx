'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { BootSequence } from '@/components/ui/BootSequence';
import { Toolbar } from '@/components/ui/Toolbar';
import { BlockPalette } from '@/components/ui/BlockPalette';
import { LayerPanel } from '@/components/ui/LayerPanel';
import { HistoryPanel } from '@/components/ui/HistoryPanel';
import { StatusBar } from '@/components/ui/StatusBar';
import { IntegrityMeter } from '@/components/ui/IntegrityMeter';
import { ContractPanel } from '@/components/ui/ContractPanel';
import { SettingsPanel } from '@/components/ui/SettingsPanel';
import { AnomalyAlert } from '@/components/ui/AnomalyAlert';
import { ExamplesQuickLoad } from '@/components/ui/ExamplesQuickLoad';
import { ShortcutsOverlay } from '@/components/ui/ShortcutsOverlay';
import { LoadingVeil } from '@/components/ui/LoadingVeil';
import { HudStream } from '@/components/ui/HudStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEffectBindings } from '@/hooks/useEffectBindings';
import { useEngine } from '@/hooks/useEngine';
import { useUIStore } from '@/stores/uiStore';
import { autoSave, loadAutoSave } from '@/lib/persistence';
import { getEngine } from '@/hooks/useEngine';

// Scene is client-only because R3F + WebGL requires a browser context.
const Scene = dynamic(() => import('@/components/scene/Scene').then((m) => m.Scene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-void" />,
});

export default function App() {
  // Initialize the V2 engine singleton at app mount. Phase 1 stub resolves
  // synchronously; future phases will block on worker spin-up.
  useEngine();
  useKeyboardShortcuts();
  useEffectBindings();
  const booted = useUIStore((s) => s.booted);

  // Restore autosave on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadAutoSave();
      if (cancelled) return;
      if (!ok) {
        // No autosave: nothing to do; user can request a contract.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Periodic autosave (every 20s, only when there are blocks).
  useEffect(() => {
    const id = setInterval(() => {
      if (getEngine().getStats().cellCount > 0) autoSave();
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden crt-overlay">
      <Scene />
      <HudStream />

      {/* HUD — only show after boot completes */}
      {booted && (
        <>
          <Toolbar />
          <BlockPalette />
          <LayerPanel />
          <HistoryPanel />
          <ContractPanel />
          <SettingsPanel />
          <IntegrityMeter />
          <AnomalyAlert />
          <ExamplesQuickLoad />
          <StatusBar />
          <BrandStamp />
          <ShortcutsOverlay />
          <LoadingVeil />
        </>
      )}

      <BootSequence />
    </main>
  );
}

function BrandStamp() {
  return (
    <div className="absolute top-4 left-4 z-30 panel px-3 py-1.5 corner-bracket">
      <div className="terminal text-[10px] text-cyan-glow/65">// NEXUS-OS v8.41.2</div>
      <div className="terminal text-sm neon-text-cyan tracking-widest">OBSIDIAN PROTOCOL</div>
    </div>
  );
}
