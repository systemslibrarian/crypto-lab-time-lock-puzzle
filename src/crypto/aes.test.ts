/* Published ground truth for the sealing path in aes.ts, plus the negative
 * claim its own header makes.
 *
 * aes.ts had no test file at all. The three things it relies on were therefore
 * unverified: that SHA-256 is computed correctly over the fixed-width answer
 * encoding, that AES-GCM here means a 96-bit IV with a 128-bit tag APPENDED to
 * the ciphertext, and that a wrong answer fails closed rather than leaking
 * garbled plaintext -- which is the lesson the module's own comment says the
 * cryptography enforces "not by a UI check".
 *
 * THE VECTORS ARE COPIED FROM THE PUBLICATION, not reproduced from WebCrypto.
 * Both come from NIST's Cryptographic Algorithm Validation Program response
 * files, fetched from csrc.nist.gov:
 *
 *   shabytetestvectors.zip -> SHA256ShortMsg.rsp, the Len = 24 case
 *   gcmtestvectors.zip     -> gcmEncryptExtIV256.rsp, the first Count in the
 *                             [Keylen = 256] [IVlen = 96] [PTlen = 128]
 *                             [AADlen = 0] [Taglen = 128] section
 *
 * That GCM section was chosen because it is the one that matches what this
 * module actually does: a 256-bit key, the 12-byte IV sealMessage generates, no
 * additional data, and the default tag length. A vector regenerated from
 * WebCrypto would agree with this code for the same reason it agrees with
 * itself, and would prove nothing.
 */
import { describe, it, expect } from 'vitest';
import { sealMessage, openMessage } from './aes';

const hex = (h: string) => Uint8Array.from((h.match(/../g) ?? []).map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('published NIST vectors for the primitives this module uses', () => {
  it('SHA-256 matches CAVP SHA256ShortMsg.rsp, Len = 24', async () => {
    const digest = await crypto.subtle.digest('SHA-256', hex('b4190e') as BufferSource);
    expect(toHex(new Uint8Array(digest)))
      .toBe('dff2e73091f6c05e528896c4c831b9448653dc2ff043528f6769437bc7b975c2');
  });

  it('AES-256-GCM matches CAVP gcmEncryptExtIV256.rsp, and the tag is appended', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      hex('31bdadd96698c204aa9ce1448ea94ae1fb4a9a0b3c9d773b51bb1822666b8f22') as BufferSource,
      'AES-GCM',
      false,
      ['encrypt'],
    );
    const out = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: hex('0d18e06c7c725ac9e362e1ce') as BufferSource },
      key,
      hex('2db5168e932556f8089a0622981d017d') as BufferSource,
    ));
    /* CAVP lists CT and Tag separately; WebCrypto returns them concatenated.
       Asserting the concatenation is what pins the layout openMessage depends
       on -- a prepended or 96-bit tag would still round-trip inside this module
       and silently differ from the published case. */
    expect(toHex(out)).toBe('fa4362189661d163fcd6a56d8bf0405a' + 'd636ac1bbedd5cc3ee727dc2ab4a9489');
    expect(out.length).toBe(16 + 16);
  });
});

describe('the claim this module says the cryptography enforces', () => {
  const MODULUS_BYTES = 32;
  const answer = 0x5eed_c0ffee_1234_5678n;

  it('a wrong answer fails closed: null, and no plaintext of any kind', async () => {
    const { ciphertext, iv } = await sealMessage('the vault opens at dawn', answer, MODULUS_BYTES);
    expect(await openMessage(ciphertext, iv, answer, MODULUS_BYTES)).toBe('the vault opens at dawn');
    for (const wrong of [answer + 1n, answer - 1n, 0n, answer ^ 1n]) {
      expect(await openMessage(ciphertext, iv, wrong, MODULUS_BYTES)).toBeNull();
    }
  });

  it('a tampered ciphertext fails closed even with the right answer', async () => {
    const { ciphertext, iv } = await sealMessage('tamper target', answer, MODULUS_BYTES);
    const raw = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    raw[0] ^= 0x01;
    const flipped = btoa(String.fromCharCode(...raw));
    expect(await openMessage(flipped, iv, answer, MODULUS_BYTES)).toBeNull();
  });

  it('the fixed-width encoding reduces modulo 2^(8*modulusBytes), as documented', async () => {
    const { ciphertext, iv } = await sealMessage('width', answer, MODULUS_BYTES);
    /* The module reduces b before hashing so creator and solver hash identical
       bytes, so an answer differing by exactly the modulus must open it. */
    const congruent = answer + (1n << BigInt(MODULUS_BYTES * 8));
    expect(await openMessage(ciphertext, iv, congruent, MODULUS_BYTES)).toBe('width');
    /* And a different width must NOT, since the hashed byte string differs. */
    expect(await openMessage(ciphertext, iv, answer, 16)).toBeNull();
  });
});
