// compress.worker.ts — stateless OBS2 codec (Phase 5).
//
// A pure RPC worker: it holds no voxel state. The engine hands it chunk buffers
// to ENCODE into one OBS2 ArrayBuffer, or an OBS2 buffer to DECODE back into
// per-chunk buffers. Keeping (de)serialization off the main thread means large
// saves don't block interaction frames.
//
// Flow is main <-> compress and main <-> voxel; the worker never talks to
// voxel.worker directly (an earlier protocol draft wired a voxelPort here; it
// was dropped to keep the message graph honest).
//
// Black-box rule: imports only the pure OBS2 codec + protocol types. No React,
// Zustand, Three.js.

/// <reference lib="webworker" />

import type { CompressToMainMsg, MainToCompressMsg } from '@/engine/bridge/WorkerProtocol';
import { decodeOBS2, encodeOBS2 } from '@/engine/persist/obs2';

function send(msg: CompressToMainMsg, transfer: Transferable[] = []): void {
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

self.onmessage = (ev: MessageEvent<MainToCompressMsg>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'INIT':
        send({ type: 'READY' });
        break;

      case 'ENCODE': {
        const buffer = encodeOBS2({
          chunks: msg.chunks,
          layers: msg.layers,
          contract: msg.contract,
          name: msg.name,
          thumbnail: msg.thumbnail,
          cellCount: msg.cellCount,
        });
        send({ type: 'ENCODED', requestId: msg.requestId, buffer }, [buffer]);
        break;
      }

      case 'DECODE': {
        const out = decodeOBS2(msg.buffer);
        send(
          {
            type: 'DECODED',
            requestId: msg.requestId,
            chunks: out.chunks,
            layers: out.layers,
            contract: out.contract,
            name: out.name,
            thumbnail: out.thumbnail,
          },
          out.chunks.map((c) => c.data),
        );
        break;
      }

      case 'DISPOSE':
        break;

      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // requestId is present on ENCODE/DECODE; absent on INIT/DISPOSE.
    const requestId = 'requestId' in msg ? msg.requestId : undefined;
    send({ type: 'ERROR', requestId, message });
  }
};

export {};
