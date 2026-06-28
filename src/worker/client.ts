// Single typed client around the time-lock worker. One central message router
// so the Create and Solve panels can share one worker without clobbering each
// other's onmessage handler.

import type { GeneratedPuzzle, PublicPuzzle } from '../crypto/types';

export interface SolveProgress {
  done: number;
  total: number;
  current: string;
  stepsPerSec: number;
}

export interface SolveResult {
  stopped: boolean;
  ok: boolean;
  message: string | null;
  key: string;
  keyHex: string;
  done: number;
  elapsedMs: number;
}

let worker: Worker | null = null;
let nextId = 1;

const createPending = new Map<number, { resolve: (v: GeneratedPuzzle) => void; reject: (e: Error) => void }>();
let activeSolve: {
  id: number;
  onProgress: (p: SolveProgress) => void;
  resolve: (r: SolveResult) => void;
  reject: (e: Error) => void;
} | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./timelock.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    switch (m.type) {
      case 'created': {
        const p = createPending.get(m.id);
        if (p) {
          createPending.delete(m.id);
          p.resolve({ puzzle: m.puzzle, trapdoor: m.trapdoor, expectedKey: m.expectedKey });
        }
        break;
      }
      case 'progress':
        if (activeSolve && activeSolve.id === m.id) {
          activeSolve.onProgress({ done: m.done, total: m.total, current: m.current, stepsPerSec: m.stepsPerSec });
        }
        break;
      case 'solved':
        if (activeSolve && activeSolve.id === m.id) {
          activeSolve.resolve({
            stopped: false,
            ok: m.ok,
            message: m.message,
            key: m.key,
            keyHex: m.keyHex,
            done: m.done,
            elapsedMs: m.elapsedMs,
          });
          activeSolve = null;
        }
        break;
      case 'stopped':
        if (activeSolve && activeSolve.id === m.id) {
          activeSolve.resolve({ stopped: true, ok: false, message: null, key: '', keyHex: '', done: m.done, elapsedMs: 0 });
          activeSolve = null;
        }
        break;
      case 'error': {
        const err = new Error(m.error);
        const p = createPending.get(m.id);
        if (p) {
          createPending.delete(m.id);
          p.reject(err);
        } else if (activeSolve && activeSolve.id === m.id) {
          activeSolve.reject(err);
          activeSolve = null;
        }
        break;
      }
    }
  };
  return worker;
}

export function createPuzzleInWorker(message: string, primeBits: number, t: number): Promise<GeneratedPuzzle> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    createPending.set(id, { resolve, reject });
    w.postMessage({ type: 'create', id, message, primeBits, t });
  });
}

export function startSolve(
  puzzle: PublicPuzzle,
  onProgress: (p: SolveProgress) => void,
): { promise: Promise<SolveResult>; stop: () => void } {
  const w = getWorker();
  const id = nextId++;
  const promise = new Promise<SolveResult>((resolve, reject) => {
    activeSolve = { id, onProgress, resolve, reject };
    w.postMessage({ type: 'solve', id, puzzle });
  });
  const stop = () => w.postMessage({ type: 'stop' });
  return { promise, stop };
}
