'use client';

import { useUIStore } from '@/stores/uiStore';
import { getEngine } from '@/hooks/useEngine';
import {
  Brush, Eraser, PaintBucket, Replace, Pipette, Box, Square, Circle,
  Camera, Layers, Clock,
  Trash2, Undo2, Redo2, Save, Upload, Download, Cog, Film, HelpCircle,
  Volume2, VolumeX, Library, Copy, Clipboard, BookmarkPlus,
  FileSignature, Boxes, Zap, Shuffle, FileBox,
} from 'lucide-react';
import type { BrushMode, BrushShape, BrushStroke, CameraPreset } from '@/types';
import { savePromptDialog, exportSave, importSaveWithLoading } from '@/lib/persistence';
import { exportVaultGltf } from '@/lib/exporters/gltf';
import { saveArtifact, newArtifactId } from '@/lib/artifacts';
import type { Artifact } from '@/lib/artifacts';
import { toast } from 'sonner';
import { useState } from 'react';
import { generateContract, applyContract } from '@/lib/contracts';

const MODES: Array<{ id: BrushMode; label: string; Icon: typeof Brush; hotkey: string; tip: string }> = [
  { id: 'paint',      label: 'PAINT',   Icon: Brush,       hotkey: 'B', tip: 'Inject neural matter into a cell.' },
  { id: 'erase',      label: 'PURGE',   Icon: Eraser,      hotkey: 'E', tip: 'Excise blocks from the vault.' },
  { id: 'fill',       label: 'FILL',    Icon: PaintBucket, hotkey: 'F', tip: 'Fill empty cells only.' },
  { id: 'replace',    label: 'REWRITE', Icon: Replace,     hotkey: 'R', tip: 'Replace cells matching the targeted block type.' },
  { id: 'eyedropper', label: 'SAMPLE',  Icon: Pipette,     hotkey: 'I', tip: 'Pull a block type from the canvas.' },
  { id: 'select',     label: 'SELECT',  Icon: Box,         hotkey: 'X', tip: 'Select a region for copy/paste.' },
];

const CAMERAS: Array<{ id: CameraPreset; label: string; tip: string; hotkey: string }> = [
  { id: 'architect',   label: 'ARCHITECT',   tip: 'High-altitude survey of the vault.',      hotkey: '1' },
  { id: 'street',      label: 'STREET',      tip: 'Walk among your construction.',           hotkey: '2' },
  { id: 'neural-dive', label: 'NEURAL DIVE', tip: 'First-person dive into the substrate.',   hotkey: '3' },
];

const SHAPES: BrushShape[] = ['rectangle', 'circle'];
const STROKES: BrushStroke[] = ['freehand', 'line'];

// ---------------------------------------------------------------------------
// Toolbar button primitive
// ---------------------------------------------------------------------------

function TBtn({
  pressed, kbd, title, onClick, disabled, variant, children,
}: {
  pressed?: boolean;
  kbd?: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'magenta' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`op-tbtn${variant ? ` ${variant}` : ''}`}
      aria-pressed={pressed}
      data-kbd={kbd}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

function Brand() {
  return (
    <div className="op-brand">
      <div className="op-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6">
          <path d="M12 2l9 5v10l-9 5-9-5V7z" />
          <path d="M3 7l9 5 9-5M12 12v10" opacity="0.55" />
          <circle cx="12" cy="12" r="1.5" fill="var(--accent)" stroke="none" />
        </svg>
      </div>
      <div className="op-title">Obsidian Protocol</div>
      <div className="op-version">v8.41.2 · NEXUS-OS</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function Toolbar() {
  const brush = useUIStore((s) => s.brush);
  const setBrush = useUIStore((s) => s.setBrush);
  const cameraPreset = useUIStore((s) => s.cameraPreset);
  const setCameraPreset = useUIStore((s) => s.setCameraPreset);
  const cinematic = useUIStore((s) => s.scene.cinematic);
  const muted = useUIStore((s) => s.scene.muted);
  const setScene = useUIStore((s) => s.setScene);
  const panels = useUIStore((s) => s.panels);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const immersiveMode = useUIStore((s) => s.immersiveMode);
  const [savingContract, setSavingContract] = useState(false);

  const selectionStart = useUIStore((s) => s.selectionStart);
  const selectionEnd = useUIStore((s) => s.selectionEnd);
  const clipboard = useUIStore((s) => s.clipboard);
  const setClipboard = useUIStore((s) => s.setClipboard);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const hoverCell = useUIStore((s) => s.hoverCell);

  const handleNewContract = async () => {
    setSavingContract(true);
    try {
      const c = generateContract();
      getEngine().setContract(c);
      applyContract(c);
      toast.success('CONTRACT ASSIGNED', { description: `${c.codename} — ${c.client}` });
      useUIStore.getState().setPanel('contract', true);
    } finally {
      setSavingContract(false);
    }
  };

  const handleCopySelection = () => {
    if (!selectionStart || !selectionEnd) {
      toast.error('No region selected. Use SELECT mode and click two corners.');
      return;
    }
    const [x0, y0, z0] = selectionStart;
    const [x1, y1, z1] = selectionEnd;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const anchorX = Math.round((minX + maxX) / 2);
    const anchorY = minY;
    const anchorZ = Math.round((minZ + maxZ) / 2);
    const cells: Artifact['cells'] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const blockId = getEngine().getBlock(x, y, z);
          if (blockId) cells.push({ dx: x - anchorX, dy: y - anchorY, dz: z - anchorZ, blockId, layer: y });
        }
      }
    }
    if (cells.length === 0) { toast.error('Selection is empty — no blocks found in region.'); return; }
    const artifact: Artifact = {
      id: newArtifactId(), name: 'Blueprint', type: 'blueprint',
      anchor: [anchorX, anchorY, anchorZ], cells, createdAt: Date.now(),
    };
    setClipboard(artifact);
    clearSelection();
    toast.success(`Copied ${cells.length} cells`, { description: 'Ctrl+V or PASTE to place.' });
  };

  const handlePasteClipboard = () => {
    if (!clipboard) { toast.error('Nothing in clipboard. Copy a selection first.'); return; }
    const [ax, ay, az] = hoverCell ?? clipboard.anchor;
    const activeLayer = getEngine().getActiveLayer();
    const soloLayer = getEngine().getLayers().find((l) => l.solo)?.id;
    getEngine().applyOps(
      clipboard.cells.map((c) => ({
        x: ax + c.dx, y: ay + c.dy, z: az + c.dz, blockId: c.blockId,
        layer: soloLayer !== undefined ? activeLayer : c.layer,
      })),
      `Paste ${clipboard.name}`,
    );
    toast.success(`Pasted "${clipboard.name}"`, { description: `${clipboard.cells.length} cells placed.` });
  };

  const handleSaveToLibrary = async () => {
    if (!clipboard) { toast.error('Nothing in clipboard to save.'); return; }
    const name = window.prompt('Name this blueprint:', clipboard.name) || clipboard.name;
    await saveArtifact({ ...clipboard, name });
    toast.success(`Saved "${name}" to Artifact Library`);
  };

  const handleSave = async () => {
    const ok = await savePromptDialog();
    if (ok) toast.success('Vault committed to local cache.');
  };

  const handleExport = async () => {
    try { await exportSave(); toast.success('Vault exported.'); }
    catch { toast.error('Export failed.'); }
  };

  const handleImport = async () => {
    try { await importSaveWithLoading(); toast.success('Vault imported.'); }
    catch { toast.error('Import failed.'); }
  };

  const handleExportGltf = async () => {
    try {
      await exportVaultGltf();
      toast.success('glTF exported.');
    } catch {
      toast.error('glTF export failed.');
    }
  };

  const cycleShape = () =>
    setBrush({ shape: SHAPES[(SHAPES.indexOf(brush.shape) + 1) % SHAPES.length] });
  const cycleStroke = () =>
    setBrush({ stroke: STROKES[(STROKES.indexOf(brush.stroke) + 1) % STROKES.length] });

  return (
    <div className="op-topbar">
      <Brand />

      <div className="op-toolbar">
        {/* ── Edit tools ── */}
        <div className="op-tgrp">
          {MODES.map(({ id, label, Icon, hotkey, tip }) => (
            <TBtn
              key={id}
              pressed={brush.mode === id}
              kbd={hotkey}
              title={`${label} (${hotkey}) — ${tip}`}
              onClick={() => setBrush({ mode: id })}
            >
              <Icon />
            </TBtn>
          ))}
        </div>

        {/* ── Brush size + shape + stroke ── */}
        <div className="op-tgrp">
          <div className="op-tstep" title="Brush radius in cells on active layer ( [ / ] )">
            <button onClick={() => setBrush({ size: Math.max(0, brush.size - 1) })}>−</button>
            <span>{brush.size}</span>
            <button onClick={() => setBrush({ size: Math.min(8, brush.size + 1) })}>+</button>
          </div>
          <button
            className="op-tsel"
            onClick={cycleShape}
            title="Flat brush shape — rectangle or circle stamp on active layer"
          >
            {brush.shape === 'circle' ? <Circle /> : <Square />} {brush.shape}
          </button>
          <button className="op-tsel" onClick={cycleStroke} title="Brush stroke">
            <Boxes /> {brush.stroke}
          </button>
          <TBtn
            pressed={brush.smartConnect}
            title="Smart connect — axis-aligned paths for Circuit / Power Line"
            onClick={() => setBrush({ smartConnect: !brush.smartConnect })}
          >
            <Zap />
          </TBtn>
          <div className="op-tstep" title="Brush randomness (0–100%)">
            <Shuffle />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brush.randomness * 100)}
              onChange={(e) => setBrush({ randomness: Number(e.target.value) / 100 })}
              className="w-16 h-1 accent-[var(--accent)]"
            />
            <span>{Math.round(brush.randomness * 100)}</span>
          </div>
        </div>

        {/* ── History ── */}
        <div className="op-tgrp">
          <TBtn kbd="Z" title="Undo (Ctrl+Z)" onClick={() => getEngine().undo()}><Undo2 /></TBtn>
          <TBtn kbd="Y" title="Redo (Ctrl+Shift+Z)" onClick={() => getEngine().redo()}><Redo2 /></TBtn>
          <TBtn pressed={panels.history} title="Chrono-log (H)" onClick={() => togglePanel('history')}>
            <Clock />
          </TBtn>
        </div>

        {/* ── Camera ── */}
        <div className="op-tgrp">
          {CAMERAS.map(({ id, label, tip, hotkey }) => (
            <TBtn
              key={id}
              pressed={cameraPreset === id}
              kbd={hotkey}
              title={`${label} (${hotkey}) — ${tip}`}
              onClick={() => setCameraPreset(id)}
            >
              <Camera />
            </TBtn>
          ))}
          <TBtn pressed={cinematic} title="Cinematic auto-rotate (C)" onClick={() => setScene({ cinematic: !cinematic })}>
            <Film />
          </TBtn>
        </div>

        <div className="op-st-spacer" style={{ flex: 1 }} />

        {/* ── Panels ── */}
        <div className="op-tgrp">
          <TBtn pressed={panels.layers} title="Layers (L)" onClick={() => togglePanel('layers')}><Layers /></TBtn>
          <TBtn pressed={panels.artifacts} title="Artifact Library (A)" onClick={() => togglePanel('artifacts')}><Library /></TBtn>
          <TBtn pressed={panels.settings} title="Settings" onClick={() => togglePanel('settings')}><Cog /></TBtn>
          <TBtn pressed={panels.shortcuts} title="Keyboard shortcuts ( ? )" onClick={() => togglePanel('shortcuts')}><HelpCircle /></TBtn>
          <TBtn pressed={!muted} title={muted ? 'Audio muted (M)' : 'Audio engaged (M)'} onClick={() => setScene({ muted: !muted })}>
            {muted ? <VolumeX /> : <Volume2 />}
          </TBtn>
          {immersiveMode && (
            <TBtn variant="magenta" title="Generate new contract (N)" onClick={handleNewContract} disabled={savingContract}>
              <FileSignature />
            </TBtn>
          )}
        </div>

        {/* ── Blueprint clipboard ── */}
        <div className="op-tgrp">
          <TBtn title="Copy selection (Ctrl+C)" onClick={handleCopySelection}><Copy /></TBtn>
          <TBtn title="Paste at cursor (Ctrl+V)" onClick={handlePasteClipboard}><Clipboard /></TBtn>
          <TBtn title="Save to Artifact Library" onClick={handleSaveToLibrary}><BookmarkPlus /></TBtn>
        </div>

        {/* ── IO ── */}
        <div className="op-tgrp">
          <TBtn kbd="S" title="Save vault (Ctrl+S)" onClick={handleSave}><Save /></TBtn>
          <TBtn title="Export vault" onClick={handleExport}><Download /></TBtn>
          <TBtn title="Export glTF (.glb)" onClick={handleExportGltf}><FileBox /></TBtn>
          <TBtn title="Import vault" onClick={handleImport}><Upload /></TBtn>
          <TBtn
            variant="danger"
            title="Purge entire vault"
            onClick={() => { if (window.confirm('Purge entire vault?')) { getEngine().clearAll(); toast.warning('Vault purged.'); } }}
          >
            <Trash2 />
          </TBtn>
        </div>
      </div>
    </div>
  );
}
