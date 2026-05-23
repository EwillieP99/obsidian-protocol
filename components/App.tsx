'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { BootSequence } from '@/components/ui/BootSequence';
import { Toolbar } from '@/components/ui/Toolbar';
import { BlockPalette } from '@/components/ui/BlockPalette';
import { LayerPanel } from '@/components/ui/LayerPanel';
import { ActiveLayerCard } from '@/components/ui/ActiveLayerCard';
import { CanvasHud } from '@/components/ui/CanvasHud';
import { HistoryPanel } from '@/components/ui/HistoryPanel';
import { StatusBar } from '@/components/ui/StatusBar';
import { IntegrityMeter } from '@/components/ui/IntegrityMeter';
import { ContractPanel } from '@/components/ui/ContractPanel';
import { SettingsPanel } from '@/components/ui/SettingsPanel';
import { AnomalyAlert } from '@/components/ui/AnomalyAlert';
import { ArtifactLibraryPanel } from '@/components/ui/ArtifactLibraryPanel';
import { ShortcutsOverlay } from '@/components/ui/ShortcutsOverlay';
import { LoadingVeil } from '@/components/ui/LoadingVeil';
import { FirstRunHints } from '@/components/ui/FirstRunHints';
import { SelectionHud } from '@/components/ui/SelectionHud';
import { HudStream } from '@/components/ui/HudStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEffectBindings } from '@/hooks/useEffectBindings';
import { useEngine, useEngineErrorHandler } from '@/hooks/useEngine';
import { useUIStore } from '@/stores/uiStore';
import { autoSave, loadAutoSave } from '@/lib/persistence';
import { loadSettings } from '@/lib/settingsPersistence';
import { getEngine } from '@/hooks/useEngine';
import { toast } from 'sonner';

// Scene is client-only because R3F + WebGL requires a browser context.
const Scene = dynamic(() => import('@/components/scene/Scene').then((m) => m.Scene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-void" />,
});

export default function App() {
  // Initialize the V2 engine singleton at app mount.
  useEngine();
  useEngineErrorHandler();
  useKeyboardShortcuts();
  useEffectBindings();
  const booted = useUIStore((s) => s.booted);
  const showLayers = useUIStore((s) => s.panels.layers);
  const scanlines = useUIStore((s) => s.scene.scanlines);
  const vignette = useUIStore((s) => s.scene.vignette);
  const theme = useUIStore((s) => s.theme);

  // Restore persisted scene/theme settings from localStorage.
  useEffect(() => {
    const saved = loadSettings();
    if (saved) useUIStore.getState().hydrateSettings(saved);
  }, []);

  // Live design tokens — push accent / density / chrome onto :root so the
  // whole op- shell re-themes instantly.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--op-magenta', theme.magenta);
    root.style.setProperty('--op-amber', theme.amber);
    root.style.setProperty('--op-green', theme.green);
    root.setAttribute('data-density', theme.density);
    root.setAttribute('data-chrome', theme.chrome);
    root.setAttribute('data-contrast', theme.contrast);
  }, [theme.accent, theme.magenta, theme.amber, theme.green, theme.density, theme.chrome, theme.contrast]);

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
      if (getEngine().getStats().cellCount > 0) {
        autoSave()
          .then(() => {
            const ui = useUIStore.getState();
            ui.setLastSavedAt(Date.now());
            ui.setLastSaveError(null);
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            useUIStore.getState().setLastSaveError(msg);
            toast.error(`Autosave failed: ${msg}`, { duration: 5000 });
          });
      }
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="op-app overflow-hidden">
      {/* ── Top bar (brand + toolbar) ── */}
      {booted && <Toolbar />}

      {/* ── Left dock: Block Matrix ── */}
      {booted && <BlockPalette />}

      {/* ── Center: bordered canvas with HUD overlays ── */}
      <div className="op-canvas">
        <div className="op-vstage">
          <Scene />
          {booted && <SelectionHud />}
          {booted && <CanvasHud />}
        </div>
      </div>

      {/* ── Right dock: Vault Layers + Active Layer ── */}
      {booted && showLayers && (
        <div className="op-right">
          <LayerPanel />
          <ActiveLayerCard />
        </div>
      )}

      {/* ── Footer: status bar ── */}
      {booted && <StatusBar />}

      {/* ── Floating overlays / modal panels (out of grid flow) ── */}
      {booted && (
        <>
          <HistoryPanel />
          <ContractPanel />
          <SettingsPanel />
          <IntegrityMeter />
          <AnomalyAlert />
          <ArtifactLibraryPanel />
          <ShortcutsOverlay />
          <LoadingVeil />
          <FirstRunHints />
        </>
      )}

      {/* ── Atmosphere ── */}
      <HudStream />
      {scanlines && <div className="op-scanlines" />}
      {vignette && <div className="op-vignette" />}

      <BootSequence />
    </main>
  );
}
