// Wires the "Create" panel: pick a secret + difficulty, generate the puzzle in
// the worker, and display the public parameters anyone could use to solve it.

import { $, renderParam, ellipsize, formatInt, formatDuration, setStatus, makeCopyButton } from './dom';
import { setPuzzle, getState } from '../state';
import { createPuzzleInWorker } from '../worker/client';
import { randomBits, squareStepBench } from './bench';

function selectedT(): number {
  const diff = $<HTMLSelectElement>('difficulty').value;
  if (diff === 'custom') {
    const v = parseInt($<HTMLInputElement>('customT').value, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return parseInt(diff, 10);
}

function primeBits(): number {
  return parseInt($<HTMLSelectElement>('modbits').value, 10);
}

// Calibrate this device's sequential-squaring rate for the chosen modulus size,
// so the ETA reflects real hardware. The lesson: time depends on the machine.
let cachedRate: { bits: number; rate: number } | null = null;
function deviceRate(bits: number): number {
  if (cachedRate && cachedRate.bits === bits) return cachedRate.rate;
  const n = randomBits(bits * 2) | 1n; // modulus-sized odd value
  const rate = squareStepBench(n);
  cachedRate = { bits, rate };
  return rate;
}

function updateEta(): void {
  const note = $('etaNote');
  const rate = deviceRate(primeBits());
  const secs = selectedT() / rate;
  note.innerHTML =
    `≈ <strong>${formatDuration(secs)}</strong> of sequential work on <em>this</em> device ` +
    `(~${formatInt(Math.round(rate))} squarings/sec at this modulus size). A faster machine is quicker; ` +
    `more machines are <em>not</em>.`;
}

function renderPublicParams(): void {
  const { puzzle } = getState();
  const container = $('pubParams');
  container.innerHTML = '';
  if (!puzzle) return;
  renderParam(container, 'N (modulus)', puzzle.n, `${ellipsize(puzzle.n)}  ·  ${puzzle.modulusBits}-bit`);
  renderParam(container, 'a (base)', puzzle.a, ellipsize(puzzle.a));
  renderParam(container, 't (squarings)', String(puzzle.t), formatInt(puzzle.t));
  renderParam(container, 'ciphertext', puzzle.ciphertext, ellipsize(puzzle.ciphertext, 18, 8));
  renderParam(container, 'iv', puzzle.iv, puzzle.iv);

  // Give the "Copy puzzle as JSON" button the real, current value.
  const old = $('copyJsonBtn');
  const fresh = makeCopyButton(() => JSON.stringify(puzzle, null, 2), 'Copy puzzle as JSON');
  fresh.className = 'action ghost';
  fresh.id = 'copyJsonBtn';
  old.replaceWith(fresh);
}

export function initCreatePanel(switchToSolve: () => void): void {
  const difficulty = $<HTMLSelectElement>('difficulty');
  const customT = $<HTMLInputElement>('customT');
  const modbits = $<HTMLSelectElement>('modbits');
  const createBtn = $<HTMLButtonElement>('createBtn');
  const status = $('createStatus');
  const out = $('createOut');

  difficulty.addEventListener('change', () => {
    customT.style.display = difficulty.value === 'custom' ? 'block' : 'none';
    updateEta();
  });
  customT.addEventListener('input', updateEta);
  modbits.addEventListener('change', () => {
    cachedRate = null;
    updateEta();
  });

  $('loadSampleBtn').addEventListener('click', () => {
    $<HTMLTextAreaElement>('secret').value = 'The treasure is buried beneath the third oak. 🗝️';
    difficulty.value = '250000';
    customT.style.display = 'none';
    updateEta();
  });

  createBtn.addEventListener('click', async () => {
    const message = $<HTMLTextAreaElement>('secret').value;
    if (!message) {
      setStatus(status, 'fail', '⚠️', 'Enter a secret message first.');
      return;
    }
    const t = selectedT();
    const bits = primeBits();
    createBtn.disabled = true;
    out.style.display = 'none';
    setStatus(
      status,
      'working',
      '⏳',
      t === 0
        ? 'Generating… note: t = 0 means NO work is required to open it (no lock).'
        : `Generating a ${bits * 2}-bit modulus and sealing your secret…`,
    );
    try {
      const { puzzle, trapdoor, expectedKey } = await createPuzzleInWorker(message, bits, t);
      setPuzzle(puzzle, trapdoor, expectedKey);
      renderPublicParams();
      out.style.display = 'block';
      setStatus(
        status,
        'ok',
        '✅',
        `Puzzle created. Solving it honestly takes ≈ ${formatDuration(t / deviceRate(bits))} of sequential work on this device.`,
      );
    } catch (e) {
      setStatus(status, 'fail', '✗', `Generation failed: ${String(e)}`);
    } finally {
      createBtn.disabled = false;
    }
  });

  $('goSolveBtn').addEventListener('click', switchToSolve);

  updateEta();
}
