import { describe, it, expect } from 'vitest';
import { isProbablePrime, randomPrime, generateModulus } from './primes';
import { bitLength } from './bigint';

describe('isProbablePrime', () => {
  it('accepts known primes', () => {
    for (const p of [2n, 3n, 5n, 97n, 7919n, 104729n, (1n << 61n) - 1n]) {
      expect(isProbablePrime(p)).toBe(true);
    }
  });
  it('rejects composites', () => {
    for (const c of [0n, 1n, 4n, 100n, 7917n, 104730n, 561n /* Carmichael */]) {
      expect(isProbablePrime(c)).toBe(false);
    }
  });
});

describe('randomPrime / generateModulus', () => {
  it('produces a prime of the requested bit length', () => {
    const p = randomPrime(64);
    expect(bitLength(p)).toBe(64);
    expect(isProbablePrime(p)).toBe(true);
  });
  it('produces N = p*q with distinct prime factors', () => {
    const { p, q, n } = generateModulus(64);
    expect(p).not.toBe(q);
    expect(isProbablePrime(p)).toBe(true);
    expect(isProbablePrime(q)).toBe(true);
    expect(p * q).toBe(n);
  });
});
