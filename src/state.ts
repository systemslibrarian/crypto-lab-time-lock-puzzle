// Tiny shared session state. The current puzzle and its trapdoor live only here,
// in memory, for the life of the page — never persisted to storage or network.

import type { PublicPuzzle, Trapdoor } from './crypto/types';

interface SessionState {
  puzzle: PublicPuzzle | null;
  /** Present only for a puzzle created in THIS tab — enables the creator shortcut. */
  trapdoor: Trapdoor | null;
  /** The true answer b, for in-demo verification of a created puzzle. */
  expectedKey: string | null;
}

const state: SessionState = { puzzle: null, trapdoor: null, expectedKey: null };
const listeners = new Set<() => void>();

export function getState(): Readonly<SessionState> {
  return state;
}

export function setPuzzle(
  puzzle: PublicPuzzle,
  trapdoor: Trapdoor | null,
  expectedKey: string | null,
): void {
  state.puzzle = puzzle;
  state.trapdoor = trapdoor;
  state.expectedKey = expectedKey;
  listeners.forEach((fn) => fn());
}

export function onPuzzleChange(fn: () => void): void {
  listeners.add(fn);
}
