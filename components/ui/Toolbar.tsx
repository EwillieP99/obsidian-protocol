'use client';

import { motion } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { getEngine } from '@/hooks/useEngine';
import {
  Brush, Eraser, PaintBucket, Replace, Pipette,
  Camera, Layers, Clock, FileSignature,
  Trash2, Undo2, Redo2, Save, Upload, Download, Cog, Film, HelpCircle, Volume2, VolumeX,
} from 'lucide-react';
import type { BrushMode, CameraPreset } from '@/types';
import { savePromptDialog, exportSaveJSON, importSaveJSONWithLoading } from '@/lib/persistence';
import { toast } from 'sonner';
import { useState } from 'react';
import { generateContract, applyContract } from '@/lib/contracts';

const MODES: Array<{ id: BrushMode; label: string; Icon: typeof Brush; hotkey: string; tip: string }> = [
  { id: 'paint',     label: 'PAINT',    Icon: Brush,       hotkey: 'B', tip: 'Inject neural matter into a cell.' },
  { id: 'erase',     label: 'PURGE',    Icon: Eraser,      hotkey: 'E', tip: 'Excise blocks from the vault.' },
  { id: 'fill',      label: 'FILL',     Icon: PaintBucket, hotkey: 'F', tip: 'Fill empty cells only.' },
  { id: 'replace',   label: 'REWRITE',  Icon: Replace,     hotkey: 'R', tip: 'Replace cells matching the targeted block type.' },
  { id: 'eyedropper',label: 'SAMPLE',   Icon: Pipette,     hotkey: 'I', tip: 'Pull a block type from the canvas.' },
];

const CAMERAS: Array<{ id: CameraPreset; label: string; tip: string; hotkey: string }> = [
  { id: 'architect',  label: 'ARCHITECT',   tip: 'High-altitude survey of the vault.', hotkey: '1' },
  { id: 'street',     label: 'STREET',      tip: 'Walk among your construction.',      hotkey: '2' },
  { id: 'neural-dive',label: 'NEURAL DIVE', tip: 'First-person dive into the substrate.', hotkey: '3' },
];

const tap = { whileHover: { scale: 1.06 }, whileTap: { scale: 0.94 } } as const;

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
  const [savingContract, setSavingContract] = useState(false);

  const handleNewContract = async () => {
    setSavingContract(true);
    try {
      const c = generateContract();
      getEngine().setContract(c);
      applyContract(c);
      toast.success('CONTRACT ASSIGNED', {
        description: `${c.codename} — ${c.client}`,
      });
      useUIStore.getState().setPanel('contract', true);
    } finally {
      setSavingContract(false);
    }
  };

  const handleSave = async () => {
    const ok = await savePromptDialog();
    if (ok) toast.success('Vault committed to local cache.');
  };

  const handleExport = async () => {
    try {
      await exportSaveJSON();
      toast.success('Exported vault snapshot.');
    } catch {
      toast.error('Export failed.');
    }
  };

  const handleImport = async () => {
    try {
      await importSaveJSONWithLoading();
      toast.success('Vault imported.');
    } catch {
      toast.error('Import failed.');
    }
  };

  return (
    <motion.div
      initial={{ y: -36, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.1 }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 panel px-3 py-2 corner-bracket"
    >
      <div className="flex items-center gap-2">
        {/* Brush modes */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          {MODES.map(({ id, label, Icon, hotkey, tip }) => (
            <motion.button
              key={id}
              {...tap}
              data-active={brush.mode === id}
              className="btn-neon flex items-center gap-1.5"
              onClick={() => setBrush({ mode: id })}
              title={`${label} (${hotkey}) — ${tip}`}
            >
              <Icon size={13} />
              <span className="hidden xl:inline">{label}</span>
            </motion.button>
          ))}
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          <span className="terminal text-[10px] text-cyan-glow/60 mr-1">SIZE</span>
          <motion.button
            {...tap}
            className="btn-neon !px-2 !py-1"
            onClick={() => setBrush({ size: Math.max(0, brush.size - 1) })}
            title="Decrease brush size [ ["
          >−</motion.button>
          <span className="terminal text-xs text-cyan-glow w-5 text-center">{brush.size}</span>
          <motion.button
            {...tap}
            className="btn-neon !px-2 !py-1"
            onClick={() => setBrush({ size: Math.min(8, brush.size + 1) })}
            title="Increase brush size [ ]"
          >+</motion.button>
          <select
            className="ml-1 bg-void/80 border border-cyan-neon/40 text-cyan-glow terminal text-[10px] px-1 py-1"
            value={brush.shape}
            onChange={(e) => setBrush({ shape: e.target.value as 'cube' | 'sphere' | 'plane' })}
            title="Brush shape"
          >
            <option value="cube">CUBE</option>
            <option value="sphere">SPHERE</option>
            <option value="plane">PLANE</option>
          </select>
        </div>

        {/* History */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          <motion.button {...tap} className="btn-neon !px-2" onClick={() => getEngine().undo()} title="Undo (Ctrl+Z)">
            <Undo2 size={13} />
          </motion.button>
          <motion.button {...tap} className="btn-neon !px-2" onClick={() => getEngine().redo()} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={13} />
          </motion.button>
          <motion.button
            {...tap}
            className="btn-neon !px-2"
            data-active={panels.history}
            onClick={() => togglePanel('history')}
            title="Toggle history timeline"
          >
            <Clock size={13} />
          </motion.button>
        </div>

        {/* Camera */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          {CAMERAS.map(({ id, label, tip, hotkey }) => (
            <motion.button
              key={id}
              {...tap}
              data-active={cameraPreset === id}
              className="btn-neon !px-2"
              onClick={() => setCameraPreset(id)}
              title={`${label} (${hotkey}) — ${tip}`}
            >
              <Camera size={13} />
              <span className="hidden 2xl:inline ml-1">{label}</span>
            </motion.button>
          ))}
          <motion.button
            {...tap}
            data-active={cinematic}
            className="btn-neon !px-2"
            onClick={() => setScene({ cinematic: !cinematic })}
            title="Cinematic auto-rotate (C)"
          >
            <Film size={13} />
          </motion.button>
        </div>

        {/* Panels */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          <motion.button {...tap} data-active={panels.layers} className="btn-neon !px-2" onClick={() => togglePanel('layers')} title="Layers (L)">
            <Layers size={13} />
          </motion.button>
          <motion.button {...tap} data-active={panels.contract} className="btn-neon !px-2" onClick={() => togglePanel('contract')} title="Active contract">
            <FileSignature size={13} />
          </motion.button>
          <motion.button {...tap} data-active={panels.settings} className="btn-neon !px-2" onClick={() => togglePanel('settings')} title="Settings">
            <Cog size={13} />
          </motion.button>
          <motion.button
            {...tap}
            data-active={panels.shortcuts}
            className="btn-neon !px-2"
            onClick={() => togglePanel('shortcuts')}
            title="Keyboard shortcuts ( ? )"
          >
            <HelpCircle size={13} />
          </motion.button>
          <motion.button
            {...tap}
            className="btn-neon !px-2"
            onClick={() => setScene({ muted: !muted })}
            title={muted ? 'Audio muted (M)' : 'Audio engaged (M)'}
            data-active={!muted}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </motion.button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pr-2 border-r border-cyan-neon/20">
          <motion.button {...tap} className="btn-magenta !px-2" onClick={handleNewContract} disabled={savingContract} title="Generate new corporate contract (N)">
            <FileSignature size={13} />
            <span className="hidden xl:inline ml-1">CONTRACT</span>
          </motion.button>
        </div>

        {/* IO */}
        <div className="flex items-center gap-1">
          <motion.button {...tap} className="btn-neon !px-2" onClick={handleSave} title="Save to local vault cache (Ctrl+S)">
            <Save size={13} />
          </motion.button>
          <motion.button {...tap} className="btn-neon !px-2" onClick={handleExport} title="Export JSON snapshot">
            <Download size={13} />
          </motion.button>
          <motion.button {...tap} className="btn-neon !px-2" onClick={handleImport} title="Import JSON snapshot">
            <Upload size={13} />
          </motion.button>
          <motion.button
            {...tap}
            className="btn-neon !px-2 hover:!border-signal-red hover:!text-signal-red"
            onClick={() => {
              if (window.confirm('Purge entire vault?')) {
                getEngine().clearAll();
                toast.warning('Vault purged.');
              }
            }}
            title="Purge entire vault"
          >
            <Trash2 size={13} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
