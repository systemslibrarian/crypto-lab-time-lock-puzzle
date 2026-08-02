// Device calibration: measure how many sequential squarings mod N this machine
// does per second, so the displayed ETA reflects real (per-device) speed.

import { squareStep } from '../crypto/timelock';
export { randomBits } from '../crypto/bigint';

/**
 * Where the timed loop's final value escapes to.
 *
 * Nothing reads this for its value, and that is the point: `x` was previously
 * dead after the loop, so the engine was free to eliminate the squarings it was
 * supposed to be timing. It did — calibration reported 9 to 16 BILLION
 * squarings per second against the Solve tab's own counter of roughly 640
 * thousand in the same session, which made every difficulty render "≈ <1s".
 * Writing to a module-level binding the optimiser cannot prove unused keeps the
 * work observable.
 */
const SINK_KEY = '__tlpBenchSink';

/**
 * Returns squarings/sec for a modulus-sized N, timed over a short window.
 *
 * The accumulated value is written onto globalThis rather than a local or a
 * module binding. Both of those are provably dead once nothing reads them, and
 * the bundler duly removed the work this function exists to time: calibration
 * reported 14.5 BILLION squarings/sec in the built page, against the Solve
 * tab's own counter of roughly 640 thousand in the same session, so every
 * difficulty from t = 50,000 to t = 100,000,000 rendered "≈ <1s" — in a demo
 * whose entire subject is elapsed time. A property on globalThis cannot be
 * proven unused, so the squarings survive optimisation.
 */
export function squareStepBench(n: bigint): number {
  const sink = globalThis as unknown as Record<string, bigint>;
  let x = (n - 3n) % n;
  // Warm up so JIT/BigInt paths are hot before timing.
  for (let i = 0; i < 2000; i++) x = squareStep(x, n);
  sink[SINK_KEY] = x;

  const budgetMs = 60;
  const start = performance.now();
  let count = 0;
  // Check the clock in batches to keep the loop tight.
  do {
    for (let i = 0; i < 1000; i++) x = squareStep(x, n);
    count += 1000;
    // Inside the loop, so the accumulated value is live on every iteration.
    sink[SINK_KEY] = x;
  } while (performance.now() - start < budgetMs);

  const elapsed = (performance.now() - start) / 1000;
  return count / elapsed;
}
