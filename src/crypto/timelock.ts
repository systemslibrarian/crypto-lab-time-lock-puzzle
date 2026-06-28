// Rivest–Shamir–Wagner (RSW, 1996) time-lock puzzle — the teaching subject.
//
// Idea: pick N = p*q. The answer is  b = a^(2^t) mod N.
//   * SOLVER (no factorization) must compute b by t SEQUENTIAL squarings:
//       x_0 = a,  x_{i+1} = x_i^2 mod N,  so x_t = a^(2^t) mod N = b.
//     Each step needs the previous step's output, so the work is inherently
//     sequential — a thousand machines do not finish meaningfully faster than
//     one. That is the whole point: a tunable, NON-parallelizable delay.
//   * CREATOR (knows phi(N) = (p-1)(q-1)) takes a shortcut: collapse the tower
//       e = 2^t mod phi(N)   (Euler)
//       b = a^e mod N
//     i.e. one fast modular exponentiation instead of t squarings. This is the
//     trapdoor — the asymmetry between making and solving the puzzle.
//
// The secret message is then sealed with AES-GCM under SHA-256(b). See aes.ts.

import { modPow, bitLength, byteLength } from './bigint';
import { generateModulus } from './primes';
import { randomBelow } from './bigint';
import { sealMessage, openMessage } from './aes';
import type { GeneratedPuzzle, PublicPuzzle, OpenResult } from './types';

/**
 * One sequential-squaring step: x -> x^2 mod N. Exposed so the UI and the
 * worker share the exact same step the solver must repeat t times.
 */
export function squareStep(x: bigint, n: bigint): bigint {
  return (x * x) % n;
}

/**
 * Honest solve: t sequential squarings from a. `onProgress(done, current)` is
 * called periodically; `shouldStop()` lets a caller abort. Returns b.
 * This performs the FULL work — there is no shortcut on this path.
 */
export function solveSequential(
  a: bigint,
  n: bigint,
  t: number,
  opts: {
    onProgress?: (done: number, current: bigint) => void;
    shouldStop?: () => boolean;
    progressEvery?: number;
  } = {},
): { done: number; value: bigint; stopped: boolean } {
  const every = opts.progressEvery ?? 2048;
  let x = a % n;
  let i = 0;
  for (; i < t; i++) {
    x = squareStep(x, n);
    if ((i + 1) % every === 0) {
      opts.onProgress?.(i + 1, x);
      if (opts.shouldStop?.()) return { done: i + 1, value: x, stopped: true };
    }
  }
  opts.onProgress?.(i, x);
  return { done: i, value: x, stopped: false };
}

/**
 * Trapdoor open: compute b = a^(2^t mod phi) mod N in one fast exponentiation.
 * Only the creator (who knows phi) can do this. Independent code path from
 * solveSequential — the demo asserts the two agree (see timelock.test.ts).
 */
export function openWithTrapdoor(a: bigint, n: bigint, t: number, phi: bigint): bigint {
  const e = modPow(2n, BigInt(t), phi); // 2^t mod phi(N)
  return modPow(a, e, n);
}

/**
 * Build a fresh puzzle: factor a new N, pick a base a, compute the answer b via
 * the trapdoor (fast), and seal the message under SHA-256(b). The returned
 * PublicPuzzle contains NO secret material; the Trapdoor is kept separately.
 */
export async function createPuzzle(
  message: string,
  primeBits: number,
  t: number,
): Promise<GeneratedPuzzle> {
  if (t < 0 || !Number.isSafeInteger(t)) throw new Error('t must be a non-negative integer');
  const { p, q, n } = generateModulus(primeBits);
  const phi = (p - 1n) * (q - 1n);
  // base a in [2, N-2]; avoid the trivial 0/1 values.
  const a = 2n + randomBelow(n - 3n);
  const b = openWithTrapdoor(a, n, t, phi);
  const modulusBits = bitLength(n);
  const { ciphertext, iv } = await sealMessage(message, b, byteLength(n));
  const puzzle: PublicPuzzle = {
    n: n.toString(),
    a: a.toString(),
    t,
    ciphertext,
    iv,
    modulusBits,
  };
  return {
    puzzle,
    trapdoor: { p: p.toString(), q: q.toString(), phi: phi.toString() },
    expectedKey: b.toString(),
  };
}

/** Attempt to recover the message from a candidate answer b. */
export async function tryOpen(puzzle: PublicPuzzle, b: bigint): Promise<OpenResult> {
  const n = BigInt(puzzle.n);
  const message = await openMessage(puzzle.ciphertext, puzzle.iv, b, byteLength(n));
  return message === null
    ? { ok: false, keyTried: b.toString() }
    : { ok: true, message, keyTried: b.toString() };
}

/** Basic structural validation of an imported/edited public puzzle. */
export function validatePuzzle(p: Partial<PublicPuzzle>): string | null {
  try {
    if (p.n === undefined || p.a === undefined || p.t === undefined) return 'Missing n, a, or t.';
    const n = BigInt(p.n);
    const a = BigInt(p.a);
    if (n < 2n) return 'Modulus N must be at least 2.';
    if (a < 2n || a >= n) return 'Base a must satisfy 2 ≤ a < N.';
    if (!Number.isSafeInteger(p.t) || p.t < 0) return 't must be a non-negative integer.';
    if (typeof p.ciphertext !== 'string' || typeof p.iv !== 'string') return 'Missing ciphertext or IV.';
    return null;
  } catch {
    return 'N and a must be valid integers.';
  }
}
