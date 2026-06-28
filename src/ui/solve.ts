// Wires the "Solve" panel: run the full sequential squaring (in the worker, with
// live progress + stop), plus two contrast actions — a cheat that fails closed,
// and the creator's instant trapdoor open.

import { $, renderParam, ellipsize, formatInt, formatDuration, setStatus } from './dom';
import { getState, onPuzzleChange } from '../state';
import { startSolve } from '../worker/client';
import { tryOpen, openWithTrapdoor, validatePuzzle } from '../crypto/timelock';
import type { PublicPuzzle } from '../crypto/types';

let loaded: PublicPuzzle | null = null;
let stopFn: (() => void) | null = null;

function resetStats(): void {
  $('progressFill').style.width = '0%';
  $('statSteps').textContent = '0';
  $('statPct').textContent = '0%';
  $('statRate').textContent = '—';
  $('statEta').textContent = '—';
  $('chain').textContent = '';
  const reveal = $('reveal');
  reveal.style.display = 'none';
  reveal.className = 'reveal';
}

function buttons(running: boolean): void {
  const haveTrapdoor = !!getState().trapdoor && getState().puzzle === loaded;
  $<HTMLButtonElement>('solveBtn').disabled = running || !loaded;
  $<HTMLButtonElement>('stopBtn').disabled = !running;
  $<HTMLButtonElement>('cheatBtn').disabled = running || !loaded || (loaded?.t ?? 0) === 0;
  $<HTMLButtonElement>('trapdoorBtn').disabled = running || !loaded || !haveTrapdoor;
}

function loadPuzzle(p: PublicPuzzle, fromCreate: boolean): void {
  loaded = p;
  $<HTMLTextAreaElement>('puzzleJson').value = JSON.stringify(p, null, 2);
  const params = $('solveParams');
  params.innerHTML = '';
  renderParam(params, 'N (modulus)', p.n, `${ellipsize(p.n)}  ·  ${p.modulusBits}-bit`);
  renderParam(params, 'a (base)', p.a, ellipsize(p.a));
  renderParam(params, 't (squarings)', String(p.t), formatInt(p.t));
  resetStats();
  buttons(false);
  const note = fromCreate
    ? 'Loaded the puzzle you just created. You also hold its trapdoor — try both the honest solve and the creator shortcut.'
    : 'Puzzle loaded. You do not hold the trapdoor, so the only way in is the full sequential work.';
  setStatus($('solveStatus'), 'idle', '⏳', note);
}

async function honestSolve(): Promise<void> {
  if (!loaded) return;
  const puzzle = loaded;
  resetStats();
  buttons(true);
  setStatus($('solveStatus'), 'working', '⚙️', 'Squaring sequentially… each step depends on the previous one.');

  const { promise, stop } = startSolve(puzzle, (p) => {
    const pct = p.total ? (p.done / p.total) * 100 : 100;
    $('progressFill').style.width = `${pct}%`;
    $('statSteps').textContent = formatInt(p.done);
    $('statPct').textContent = `${pct.toFixed(1)}%`;
    $('statRate').textContent = formatInt(Math.round(p.stepsPerSec));
    const remaining = (p.total - p.done) / (p.stepsPerSec || 1);
    $('statEta').textContent = formatDuration(remaining);
    $('chain').innerHTML = `x<sub>${formatInt(p.done)}</sub> = <span class="cur">${p.current}</span> &nbsp;(= previous²&nbsp;mod&nbsp;N)`;
  });
  stopFn = stop;

  try {
    const r = await promise;
    if (r.stopped) {
      setStatus($('solveStatus'), 'idle', '⏸️', `Stopped after ${formatInt(r.done)} squarings. The work is not done — start again to finish.`);
      buttons(false);
      return;
    }
    $('progressFill').style.width = '100%';
    $('statSteps').textContent = formatInt(r.done);
    $('statPct').textContent = '100%';
    $('statEta').textContent = '0s';
    if (r.ok) {
      setStatus($('solveStatus'), 'ok', '✅', `Solved honestly in ${formatDuration(r.elapsedMs / 1000)}. AES-GCM authenticated the answer — it is genuinely correct.`);
      showReveal(`🔓 Recovered message:\n\n${r.message}`, false);
    } else {
      // Should not happen on an honest full solve, but never claim success blindly.
      setStatus($('solveStatus'), 'fail', '✗', 'Computation finished but authentication failed — the parameters may be inconsistent.');
    }
  } catch (e) {
    setStatus($('solveStatus'), 'fail', '✗', `Solve error: ${String(e)}`);
  } finally {
    stopFn = null;
    buttons(false);
  }
}

// Cheat: submit the base a as if the t squarings were already done (i.e. skip
// all the work). GCM rejects the wrong key — there is no partial plaintext.
async function cheat(): Promise<void> {
  if (!loaded) return;
  resetStats();
  const n = BigInt(loaded.n);
  const skipped = BigInt(loaded.a) % n; // zero squarings performed
  const r = await tryOpen(loaded, skipped);
  $('statSteps').textContent = '0';
  $('statPct').textContent = '0%';
  if (r.ok) {
    setStatus($('solveStatus'), 'ok', '✅', 'Opened — but only because t = 0, meaning there was no lock to begin with.');
    showReveal(`Message: ${r.message}`, false);
  } else {
    setStatus($('solveStatus'), 'fail', '🚫', `Rejected. Submitting the base a without doing the ${formatInt(loaded.t)} squarings yields the wrong key, and AES-GCM’s auth tag fails closed — no plaintext leaks.`);
  }
}

// Trapdoor: the creator collapses the tower with phi(N) in one fast modPow.
async function trapdoorOpen(): Promise<void> {
  const { trapdoor } = getState();
  if (!loaded || !trapdoor) return;
  resetStats();
  setStatus($('solveStatus'), 'trapdoor', '🔓', 'Opening with the creator trapdoor φ(N)…');
  const b = openWithTrapdoor(BigInt(loaded.a), BigInt(loaded.n), loaded.t, BigInt(trapdoor.phi));
  const r = await tryOpen(loaded, b);
  if (r.ok) {
    $('statPct').textContent = '—';
    setStatus($('solveStatus'), 'trapdoor', '🔓', `Opened instantly via the trapdoor — one modular exponentiation instead of ${formatInt(loaded.t)} squarings. This privilege belongs only to whoever knows the factorisation.`);
    showReveal(`🔓 Recovered via trapdoor (creator privilege):\n\n${r.message}`, true);
  } else {
    setStatus($('solveStatus'), 'fail', '✗', 'Trapdoor open failed — parameters inconsistent.');
  }
}

function showReveal(text: string, trap: boolean): void {
  const el = $('reveal');
  el.style.display = 'block';
  el.className = trap ? 'reveal trap' : 'reveal';
  el.textContent = text;
}

export function initSolvePanel(): void {
  $('solveBtn').addEventListener('click', honestSolve);
  $('stopBtn').addEventListener('click', () => stopFn?.());
  $('cheatBtn').addEventListener('click', cheat);
  $('trapdoorBtn').addEventListener('click', trapdoorOpen);

  $('loadJsonBtn').addEventListener('click', () => {
    const raw = $<HTMLTextAreaElement>('puzzleJson').value.trim();
    let parsed: Partial<PublicPuzzle>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setStatus($('solveStatus'), 'fail', '✗', 'That is not valid JSON.');
      return;
    }
    const err = validatePuzzle(parsed);
    if (err) {
      setStatus($('solveStatus'), 'fail', '✗', `Invalid puzzle: ${err}`);
      return;
    }
    loadPuzzle(parsed as PublicPuzzle, false);
  });

  // When a puzzle is created on the other tab, auto-load it here.
  onPuzzleChange(() => {
    const p = getState().puzzle;
    if (p) loadPuzzle(p, true);
  });

  buttons(false);
}
