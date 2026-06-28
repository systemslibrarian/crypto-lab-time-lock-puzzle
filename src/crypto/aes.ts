// The secret message is sealed with real AES-256-GCM (WebCrypto), keyed by a
// SHA-256 hash of the puzzle answer b = a^(2^t) mod N. Consequences that the
// demo leans on:
//   * Recovering the message REQUIRES the exact b. A wrong b (skipped steps,
//     tampered params) yields a wrong key, and GCM's auth tag makes decryption
//     fail closed — no partial/garbled plaintext leaks. That is the "cheating
//     is detected" lesson, enforced by the cryptography, not by a UI check.

import { bigintToBytes } from './bigint';

const subtle = (): SubtleCrypto => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) throw new Error('WebCrypto SubtleCrypto unavailable');
  return c.subtle;
};

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Derive a 256-bit AES key from the puzzle answer b (fixed-width SHA-256). */
async function keyFromAnswer(b: bigint, modulusBytes: number): Promise<CryptoKey> {
  // Fixed-width encoding so both creator and solver hash identical bytes.
  const material = bigintToBytes(b % (1n << BigInt(modulusBytes * 8)), modulusBytes);
  const digest = await subtle().digest('SHA-256', material as BufferSource);
  return subtle().importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Seal a UTF-8 message under the key derived from b. Returns base64 parts. */
export async function sealMessage(
  message: string,
  b: bigint,
  modulusBytes: number,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await keyFromAnswer(b, modulusBytes);
  const iv = new Uint8Array(12);
  (globalThis.crypto as Crypto).getRandomValues(iv);
  const data = new TextEncoder().encode(message);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

/**
 * Try to open the sealed message with a candidate answer b. Resolves to the
 * plaintext on success, or null if the GCM auth tag rejects (wrong b).
 */
export async function openMessage(
  ciphertext: string,
  iv: string,
  b: bigint,
  modulusBytes: number,
): Promise<string | null> {
  const key = await keyFromAnswer(b, modulusBytes);
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(iv) as BufferSource },
      key,
      fromB64(ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null; // authentication failed — wrong key, fail closed
  }
}
