// Strict types keep the trapdoor (creator-only secret) structurally separate
// from the public puzzle, so it is impossible to accidentally export it.

/** Everything anyone needs to SOLVE the puzzle — safe to publish. */
export interface PublicPuzzle {
  /** RSA-style modulus N = p*q, decimal string (BigInt is not JSON-safe). */
  n: string;
  /** Base value a, decimal string. The solver squares this. */
  a: string;
  /** Number of sequential squarings t required to reach the key. */
  t: number;
  /** AES-GCM ciphertext of the secret message, base64. */
  ciphertext: string;
  /** AES-GCM IV, base64. */
  iv: string;
  /** Bit length of N, for display + fixed-width key derivation. */
  modulusBits: number;
}

/**
 * Creator-only secret. Knowing the factorization gives phi(N), which lets the
 * creator open the puzzle instantly via the trapdoor. NEVER part of PublicPuzzle,
 * NEVER persisted — held in memory for this session only.
 */
export interface Trapdoor {
  p: string;
  q: string;
  phi: string;
}

export interface GeneratedPuzzle {
  puzzle: PublicPuzzle;
  trapdoor: Trapdoor;
  /** The answer b = a^(2^t) mod N, decimal string — for in-demo verification. */
  expectedKey: string;
}

/** Outcome of an attempt to open a puzzle (honest solve, trapdoor, or cheat). */
export interface OpenResult {
  ok: boolean;
  /** Recovered plaintext when ok; absent when authentication failed. */
  message?: string;
  /** The key value the attempt produced, decimal string. */
  keyTried: string;
}
