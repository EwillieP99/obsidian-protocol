'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { listArtifacts, deleteArtifact, saveArtifact, seedPrefabs, SHIPPED_PREFABS } from '@/lib/artifacts';
import type { Artifact } from '@/lib/artifacts';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function ArtifactLibraryPanel() {
  const open = useUIStore((s) => s.panels.artifacts);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const stampArtifact = useUIStore((s) => s.stampArtifact);
  const setStampArtifact = useUIStore((s) => s.setStampArtifact);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [seeded, setSeeded] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listArtifacts();
    setArtifacts(list);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!seeded) {
      seedPrefabs(SHIPPED_PREFABS).then(() => {
        setSeeded(true);
        refresh();
      });
    } else {
      refresh();
    }
  }, [open, seeded, refresh]);

  const prefabs = artifacts.filter((a) => a.type === 'prefab');
  const blueprints = artifacts.filter((a) => a.type === 'blueprint');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute bottom-12 left-4 z-30 panel w-80 corner-bracket max-h-[70vh] flex flex-col"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-cyan-neon/20 flex-shrink-0">
            <span className="terminal text-xs neon-text-cyan">// ARTIFACT LIBRARY</span>
            <button
              className="terminal text-[10px] text-cyan-glow/70 hover:text-cyan-neon"
              onClick={() => togglePanel('artifacts')}
            >
              [ HIDE ]
            </button>
          </header>

          {stampArtifact && (
            <div className="px-3 py-2 bg-magenta-neon/10 border-b border-magenta-neon/30 flex-shrink-0">
              <div className="terminal text-[10px] neon-text-magenta">
                STAMP MODE — Click scene to place &ldquo;{stampArtifact.name}&rdquo;
              </div>
              <button
                className="terminal text-[9px] text-cyan-glow/60 hover:text-cyan-neon mt-1"
                onClick={() => setStampArtifact(null)}
              >
                [ CANCEL ]
              </button>
            </div>
          )}

          <div className="overflow-y-auto flex-1 p-3 space-y-4">
            {/* Prefabs */}
            <section>
              <div className="terminal text-[10px] neon-text-magenta mb-2">/// SHIPPED PREFABS</div>
              {prefabs.length === 0 ? (
                <div className="terminal text-[9px] text-cyan-glow/40">Loading...</div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {prefabs.map((a) => (
                    <ArtifactCard
                      key={a.id}
                      artifact={a}
                      isStamping={stampArtifact?.id === a.id}
                      onStamp={() => {
                        setStampArtifact(a);
                        toast.success(`Stamp mode: ${a.name}`, { description: 'Click in the scene to place.' });
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Blueprints */}
            <section>
              <div className="terminal text-[10px] neon-text-magenta mb-2">/// YOUR BLUEPRINTS</div>
              {blueprints.length === 0 ? (
                <div className="terminal text-[9px] text-cyan-glow/40">
                  No blueprints yet. Select a region and use COPY + SAVE.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {blueprints.map((a) => (
                    <ArtifactCard
                      key={a.id}
                      artifact={a}
                      isStamping={stampArtifact?.id === a.id}
                      onStamp={() => {
                        setStampArtifact(a);
                        toast.success(`Stamp mode: ${a.name}`, { description: 'Click in the scene to place.' });
                      }}
                      onDelete={async () => {
                        await deleteArtifact(a.id);
                        toast.success(`Deleted "${a.name}"`);
                        refresh();
                      }}
                      onRename={async (newName) => {
                        await saveArtifact({ ...a, name: newName });
                        refresh();
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ArtifactCard({
  artifact,
  isStamping,
  onStamp,
  onDelete,
  onRename,
}: {
  artifact: Artifact;
  isStamping: boolean;
  onStamp: () => void;
  onDelete?: () => void;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(artifact.name);

  const dominantBlock =
    artifact.cells.length > 0
      ? (() => {
          const counts: Record<string, number> = {};
          artifact.cells.forEach((c) => {
            counts[c.blockId] = (counts[c.blockId] ?? 0) + 1;
          });
          return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        })()
      : '';

  return (
    <div
      className={`panel p-2 flex flex-col gap-1 cursor-pointer border transition-colors ${
        isStamping ? 'border-magenta-neon/70' : 'border-cyan-neon/20 hover:border-cyan-neon/50'
      }`}
    >
      {/* Name */}
      {editing && onRename ? (
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(nameInput);
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setEditing(false);
              setNameInput(artifact.name);
            }
          }}
          onBlur={() => {
            onRename(nameInput);
            setEditing(false);
          }}
          className="bg-transparent border-b border-cyan-neon/40 text-[10px] terminal text-cyan-glow outline-none w-full"
        />
      ) : (
        <div
          className="terminal text-[10px] text-cyan-glow truncate"
          onDoubleClick={() => onRename && setEditing(true)}
          title={artifact.name}
        >
          {artifact.name}
        </div>
      )}

      {/* Meta */}
      <div className="terminal text-[9px] text-cyan-glow/50">
        {artifact.cells.length} cells · {dominantBlock}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-auto pt-1">
        <button
          className={`flex-1 terminal text-[9px] border px-1 py-0.5 transition-colors ${
            isStamping
              ? 'border-magenta-neon/70 text-magenta-glow'
              : 'border-cyan-neon/40 text-cyan-glow/80 hover:border-cyan-neon hover:text-cyan-neon'
          }`}
          onClick={onStamp}
        >
          {isStamping ? 'STAMPING' : 'STAMP'}
        </button>
        {onDelete && (
          <button
            className="terminal text-[9px] border border-cyan-neon/20 px-1 py-0.5 text-cyan-glow/50 hover:border-signal-red/60 hover:text-signal-red"
            onClick={onDelete}
            title="Delete blueprint"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
