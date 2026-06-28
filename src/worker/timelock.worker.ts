// Off-main-thread worker for the two expensive operations:
//   * 'create' — generate N = p*q (prime search) and seal the message.
//   * 'solve'  — the honest, sequential t squarings, in chunks so the worker
//                can still receive a 'stop' message between chunks (a single
//                tight loop would never yield and could not be cancelled).
// The trapdoor fast-open is instant and runs on the main thread instead.

import { createPuzzle, squareStep, tryOpen } from '../crypto/timelock';
import { byteLength } from '../crypto/bigint';
import type { PublicPuzzle } from '../crypto/types';

type InMsg =
  | { type: 'create'; id: number; message: string; primeBits: number; t: number }
  | { type: 'solve'; id: number; puzzle: PublicPuzzle }
  | { type: 'stop' };

let stopRequested = false;

const yieldToLoop = () => new Promise<void>((r) => setTimeout(r, 0));

function shortHex(x: bigint): string {
  const h = x.toString(16);
  return h.length <= 24 ? h : `${h.slice(0, 12)}…${h.slice(-12)}`;
}

self.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;

  if (msg.type === 'stop') {
    stopRequested = true;
    return;
  }

  if (msg.type === 'create') {
    try {
      const result = await createPuzzle(msg.message, msg.primeBits, msg.t);
      self.postMessage({ type: 'created', id: msg.id, ...result });
    } catch (e) {
      self.postMessage({ type: 'error', id: msg.id, error: String(e) });
    }
    return;
  }

  if (msg.type === 'solve') {
    stopRequested = false;
    const { id, puzzle } = msg;
    try {
      const n = BigInt(puzzle.n);
      const t = puzzle.t;
      let x = BigInt(puzzle.a) % n;
      let done = 0;
      const start = performance.now();

      // Chunk size: small enough to stay responsive, big enough to amortise
      // the yield. Tuned for ~30–60ms of work per chunk on typical hardware.
      const chunk = 4096;
      while (done < t) {
        const target = Math.min(done + chunk, t);
        for (; done < target; done++) x = squareStep(x, n);

        const now = performance.now();
        const stepsPerSec = done / ((now - start) / 1000 || 1);
        self.postMessage({
          type: 'progress',
          id,
          done,
          total: t,
          current: shortHex(x),
          stepsPerSec,
        });

        if (stopRequested) {
          self.postMessage({ type: 'stopped', id, done });
          return;
        }
        await yieldToLoop();
      }

      const elapsedMs = performance.now() - start;
      const open = await tryOpen(puzzle, x);
      self.postMessage({
        type: 'solved',
        id,
        ok: open.ok,
        message: open.message ?? null,
        key: x.toString(),
        keyHex: x.toString(16),
        done,
        elapsedMs,
        modulusBytes: byteLength(n),
      });
    } catch (e) {
      self.postMessage({ type: 'error', id, error: String(e) });
    }
    return;
  }
};
