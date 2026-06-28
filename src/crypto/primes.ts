// Real primality: Miller–Rabin, plus random-prime generation. No faked math —
// the sequential-squaring == trapdoor test vector (timelock.test.ts) only holds
// when N is a genuine product of two primes, which these functions guarantee.

import { modPow, randomBits, randomBelow, bitLength } from './bigint';

const SMALL_PRIMES: bigint[] = (() => {
  const limit = 2000;
  const sieve = new Uint8Array(limit + 1).fill(1);
  sieve[0] = sieve[1] = 0;
  for (let i = 2; i * i <= limit; i++) {
    if (sieve[i]) for (let j = i * i; j <= limit; j += i) sieve[j] = 0;
  }
  const out: bigint[] = [];
  for (let i = 2; i <= limit; i++) if (sieve[i]) out.push(BigInt(i));
  return out;
})();

/** Miller–Rabin probabilistic primality test with `rounds` random witnesses. */
export function isProbablePrime(n: bigint, rounds = 40): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  // Write n - 1 = 2^r * d with d odd.
  let d = n - 1n;
  let r = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  witness: for (let i = 0; i < rounds; i++) {
    const a = 2n + randomBelow(n - 3n); // a in [2, n-2]
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let j = 1n; j < r; j++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witness;
    }
    return false; // composite
  }
  return true; // probably prime
}

/** Generate a random probable prime with exactly `bits` bits. */
export function randomPrime(bits: number): bigint {
  if (bits < 8) throw new Error('randomPrime: use at least 8 bits');
  for (;;) {
    let candidate = randomBits(bits) | 1n; // force odd
    if (isProbablePrime(candidate)) return candidate;
  }
}

/** Generate an RSA-style modulus N = p*q with p, q distinct primes. */
export function generateModulus(primeBits: number): {
  p: bigint;
  q: bigint;
  n: bigint;
} {
  const p = randomPrime(primeBits);
  let q = randomPrime(primeBits);
  while (q === p || bitLength(p * q) < primeBits * 2) {
    q = randomPrime(primeBits);
  }
  return { p, q, n: p * q };
}
