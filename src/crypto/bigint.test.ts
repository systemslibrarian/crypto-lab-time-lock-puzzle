import { describe, it, expect } from 'vitest';
import {
  modPow,
  gcd,
  modInverse,
  egcd,
  bigintToBytes,
  bytesToBigint,
  bitLength,
} from './bigint';

describe('modPow', () => {
  it('matches small known values', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n); // 1024 mod 1000
    expect(modPow(3n, 0n, 7n)).toBe(1n);
    expect(modPow(5n, 3n, 13n)).toBe(8n); // 125 mod 13
  });
  it('agrees with naive exponentiation', () => {
    const m = 97n;
    for (let base = 2n; base < 20n; base++) {
      let naive = 1n;
      for (let i = 0n; i < 15n; i++) naive = (naive * base) % m;
      expect(modPow(base, 15n, m)).toBe(naive);
    }
  });
});

describe('gcd / egcd / modInverse', () => {
  it('computes gcd', () => {
    expect(gcd(48n, 18n)).toBe(6n);
    expect(gcd(17n, 5n)).toBe(1n);
  });
  it('egcd satisfies Bézout', () => {
    const [g, x, y] = egcd(240n, 46n);
    expect(g).toBe(2n);
    expect(240n * x + 46n * y).toBe(g);
  });
  it('modInverse undoes multiplication', () => {
    const inv = modInverse(3n, 11n);
    expect((3n * inv) % 11n).toBe(1n);
  });
  it('throws when no inverse exists', () => {
    expect(() => modInverse(4n, 8n)).toThrow();
  });
});

describe('byte encoding', () => {
  it('round-trips arbitrary values', () => {
    for (const v of [0n, 1n, 255n, 256n, 65535n, 1n << 200n]) {
      expect(bytesToBigint(bigintToBytes(v))).toBe(v);
    }
  });
  it('honours fixed width', () => {
    const b = bigintToBytes(255n, 4);
    expect(b.length).toBe(4);
    expect(bytesToBigint(b)).toBe(255n);
  });
  it('bitLength is correct', () => {
    expect(bitLength(0n)).toBe(1);
    expect(bitLength(255n)).toBe(8);
    expect(bitLength(256n)).toBe(9);
  });
});
