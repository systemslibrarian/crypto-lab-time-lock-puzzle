// Device calibration: measure how many sequential squarings mod N this machine
// does per second, so the displayed ETA reflects real (per-device) speed.

import { squareStep } from '../crypto/timelock';
export { randomBits } from '../crypto/bigint';

/** Returns squarings/sec for a modulus-sized N, timed over a short window. */
export function squareStepBench(n: bigint): number {
  let x = (n - 3n) % n;
  // Warm up so JIT/BigInt paths are hot before timing.
  for (let i = 0; i < 2000; i++) x = squareStep(x, n);

  const budgetMs = 60;
  const start = performance.now();
  let count = 0;
  // Check the clock in batches to keep the loop tight.
  do {
    for (let i = 0; i < 1000; i++) x = squareStep(x, n);
    count += 1000;
  } while (performance.now() - start < budgetMs);

  const elapsed = (performance.now() - start) / 1000;
  return count / elapsed;
}
