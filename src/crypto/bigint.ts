// Small, inspectable BigInt helpers for the RSW time-lock puzzle.
// These are the teaching subject, so they are hand-rolled rather than pulled
// from a library: a student can read exactly how the modular math works.

/** Modular exponentiation: base^exp mod m, via square-and-multiply. */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  if (exp < 0n) throw new Error('modPow: negative exponent not supported');
  let result = 1n;
  let b = base % m;
  if (b < 0n) b += m;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

/** Greatest common divisor (always non-negative). */
export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Extended Euclid: returns [g, x, y] with a*x + b*y = g = gcd(a, b). */
export function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return [oldR, oldS, oldT];
}

/** Modular inverse of a mod m, or throws if it does not exist. */
export function modInverse(a: bigint, m: bigint): bigint {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error('modInverse: no inverse (not coprime)');
  return ((x % m) + m) % m;
}

/** Bit length of a non-negative BigInt. */
export function bitLength(n: bigint): number {
  if (n < 0n) n = -n;
  return n.toString(2).length;
}

/** Number of bytes needed to encode n big-endian. */
export function byteLength(n: bigint): number {
  return Math.ceil(bitLength(n) / 8);
}

/** Big-endian byte encoding of a non-negative BigInt, optionally fixed-width. */
export function bigintToBytes(n: bigint, width?: number): Uint8Array {
  if (n < 0n) throw new Error('bigintToBytes: negative');
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = hex.length / 2;
  if (width !== undefined) {
    if (bytes > width) throw new Error('bigintToBytes: value wider than width');
    hex = hex.padStart(width * 2, '0');
    bytes = width;
  }
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Decode a big-endian byte array into a BigInt. */
export function bytesToBigint(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

const cryptoObj = (): Crypto => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.getRandomValues) throw new Error('Secure RNG unavailable');
  return c;
};

/** A cryptographically-random BigInt with exactly `bits` bits (top bit set). */
export function randomBits(bits: number): bigint {
  const bytes = Math.ceil(bits / 8);
  const buf = new Uint8Array(bytes);
  cryptoObj().getRandomValues(buf);
  let n = bytesToBigint(buf);
  // Trim to exactly `bits` bits and force the top bit so it is full-width.
  const excess = bytes * 8 - bits;
  n >>= BigInt(excess);
  n |= 1n << BigInt(bits - 1);
  return n;
}

/** A uniform random BigInt in [0, n) by rejection sampling. */
export function randomBelow(n: bigint): bigint {
  if (n <= 0n) throw new Error('randomBelow: n must be positive');
  const bits = bitLength(n);
  const bytes = Math.ceil(bits / 8);
  const excess = bytes * 8 - bits;
  for (;;) {
    const buf = new Uint8Array(bytes);
    cryptoObj().getRandomValues(buf);
    let candidate = bytesToBigint(buf) >> BigInt(excess);
    if (candidate < n) return candidate;
  }
}
