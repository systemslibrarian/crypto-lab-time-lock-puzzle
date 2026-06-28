import { describe, it, expect } from 'vitest';
import {
  solveSequential,
  openWithTrapdoor,
  createPuzzle,
  tryOpen,
  validatePuzzle,
} from './timelock';
import { generateModulus } from './primes';

describe('the load-bearing invariant: sequential solve == trapdoor open', () => {
  it('agrees for many t on a real modulus', () => {
    const { p, q, n } = generateModulus(80);
    const phi = (p - 1n) * (q - 1n);
    const a = 2n + (n % 9973n); // arbitrary base in range
    for (const t of [0, 1, 2, 7, 64, 500, 2049]) {
      const honest = solveSequential(a, n, t).value;
      const trapdoor = openWithTrapdoor(a, n, t, phi);
      expect(honest).toBe(trapdoor);
    }
  });

  it('t = 0 means no work: the answer is just a mod N', () => {
    const { n } = generateModulus(64);
    const a = 12345n % n;
    expect(solveSequential(a, n, 0).value).toBe(a % n);
  });

  it('progress callback fires and reports the final value', () => {
    const { p, q, n } = generateModulus(64);
    const phi = (p - 1n) * (q - 1n);
    const a = 7n;
    let lastDone = 0;
    const res = solveSequential(a, n, 1000, {
      progressEvery: 100,
      onProgress: (done) => {
        lastDone = done;
      },
    });
    expect(lastDone).toBe(1000);
    expect(res.value).toBe(openWithTrapdoor(a, n, 1000, phi));
  });

  it('shouldStop aborts the sequential work early', () => {
    const { n } = generateModulus(64);
    const res = solveSequential(7n, n, 1_000_000, {
      progressEvery: 50,
      shouldStop: () => true,
    });
    expect(res.stopped).toBe(true);
    expect(res.done).toBeLessThan(1_000_000);
  });
});

describe('end-to-end puzzle round trip', () => {
  it('an honest solver recovers the message', async () => {
    const t = 300;
    const { puzzle } = await createPuzzle('attack at dawn', 80, t);
    const b = solveSequential(BigInt(puzzle.a), BigInt(puzzle.n), t).value;
    const out = await tryOpen(puzzle, b);
    expect(out.ok).toBe(true);
    expect(out.message).toBe('attack at dawn');
  });

  it('fails closed when the solver skips steps (cheats)', async () => {
    const t = 300;
    const { puzzle } = await createPuzzle('top secret', 80, t);
    // Do only t-1 squarings — one short of the real answer.
    const cheated = solveSequential(BigInt(puzzle.a), BigInt(puzzle.n), t - 1).value;
    const out = await tryOpen(puzzle, cheated);
    expect(out.ok).toBe(false);
    expect(out.message).toBeUndefined();
  });

  it('fails closed when the answer is wrong by any amount', async () => {
    const { puzzle, expectedKey } = await createPuzzle('hello', 80, 50);
    const wrong = BigInt(expectedKey) + 1n;
    const out = await tryOpen(puzzle, wrong);
    expect(out.ok).toBe(false);
  });

  it('the trapdoor opens instantly and yields the same plaintext', async () => {
    const t = 5000;
    const { puzzle, trapdoor } = await createPuzzle('φ unlocks it fast', 80, t);
    const b = openWithTrapdoor(
      BigInt(puzzle.a),
      BigInt(puzzle.n),
      t,
      BigInt(trapdoor.phi),
    );
    const out = await tryOpen(puzzle, b);
    expect(out.ok).toBe(true);
    expect(out.message).toBe('φ unlocks it fast');
  });

  it('the exported public puzzle carries no trapdoor material', async () => {
    const { puzzle } = await createPuzzle('x', 64, 10);
    const json = JSON.stringify(puzzle);
    expect(json).not.toContain('phi');
    expect(json).not.toContain('"p"');
    expect(json).not.toContain('"q"');
  });
});

describe('validatePuzzle', () => {
  it('accepts a well-formed puzzle', async () => {
    const { puzzle } = await createPuzzle('ok', 64, 10);
    expect(validatePuzzle(puzzle)).toBeNull();
  });
  it('rejects out-of-range base a', () => {
    expect(validatePuzzle({ n: '15', a: '99', t: 1, ciphertext: 'x', iv: 'y' })).toMatch(/base a/i);
  });
  it('rejects a negative t', () => {
    expect(validatePuzzle({ n: '15', a: '2', t: -1, ciphertext: 'x', iv: 'y' })).toMatch(/non-negative/);
  });
});
