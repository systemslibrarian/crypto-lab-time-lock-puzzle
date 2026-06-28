# Time-Lock Puzzles

An interactive, browser-only demonstration of the **Rivest–Shamir–Wagner (RSW) time-lock puzzle** — part of the [Crypto Lab](https://systemslibrarian.github.io/crypto-lab/) suite.

## 1. What It Is

A **time-lock puzzle** seals a message so that recovering it requires a fixed amount of *sequential* computation — work that cannot be meaningfully parallelised. This demo uses the RSW construction: pick an RSA-style modulus `N = p·q` and a base `a`; the answer is `b = a^(2^t) mod N`, reachable only by squaring `t` times in order (`xᵢ₊₁ = xᵢ² mod N`). The message itself is sealed with real **AES-256-GCM** under `SHA-256(b)`. Unlike ordinary encryption, there is no shared secret key — *anyone* can open it eventually; security comes from elapsed sequential time, tuned by the step count `t`. The factorisation of `N` is a trapdoor that lets the creator (and only the creator) open it instantly.

## 2. When to Use It

- **Sending data into the future / delayed disclosure** — escrow or dead-man switches where openability must not depend on trusting a custodian.
- **Sealed-bid auctions** — bids that cannot be opened before a deadline, with no trusted auctioneer holding the plaintext.
- **Randomness beacons & commit-reveal** — force a delay between fixing an input and learning the output so no one can grind the result.
- **As the engine of a Verifiable Delay Function (VDF)** — the same squaring chain underlies Pietrzak/Wesolowski VDFs, which add a fast-to-check proof.
- **When NOT to use it:** anything needing instant, key-based access control, or a *guaranteed wall-clock* delay — solve time scales with the *speed of one machine*, so faster hardware opens it sooner. Time-lock puzzles bound parallel speed-up, not absolute time.

## 3. Live Demo

**[systemslibrarian.github.io/crypto-lab-time-lock-puzzle](https://systemslibrarian.github.io/crypto-lab-time-lock-puzzle/)**

Type a secret, choose a difficulty (number of sequential squarings `t`) and modulus size, and generate a puzzle. Then solve it: watch the squarings accumulate in a Web Worker with live progress and a per-device time estimate. Contrast three openings — the **honest sequential solve**, a **cheat** that skips the work (rejected by AES-GCM, failing closed), and the **creator's trapdoor** that opens instantly via `φ(N)`. All cryptography runs in your browser with JavaScript `BigInt` + WebCrypto; nothing is sent to a server.

## 4. How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-time-lock-puzzle
cd crypto-lab-time-lock-puzzle
npm install
npm run dev
```

Run the test suite with `npm test` (25 tests covering the math, including the load-bearing invariant that the sequential solve equals the trapdoor open). No environment variables are required.

## 5. Part of the Crypto-Lab Suite

> One of 60+ live browser demos at
> [systemslibrarian.github.io/crypto-lab](https://systemslibrarian.github.io/crypto-lab/)
> — spanning Atbash (600 BCE) through NIST FIPS 203/204/205 (2024).

---

*"Whether you eat or drink, or whatever you do, do all to the glory of God." — 1 Corinthians 10:31*
