import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText, formatNonTextFailures, type NonTextFailure } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Three rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN, AND NOTHING IS FORCED
 *     OPEN. The gate this replaced pushed `*{opacity:1!important}` through
 *     `addStyleTag` and then set `data-active='true'` on all six tab panels at
 *     once, plus `display:block` on `#createOut` and `#reveal`. That document
 *     does not exist: a reader sees exactly one panel at a time, and axe was
 *     being handed a layout — and a set of foreground colours — the browser
 *     never paints. Here every panel is reached by clicking its tab.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans well
 *     past first paint. axe over an empty container passes having checked
 *     nothing, and at first paint five of the six panels are `display: none`,
 *     `#pubParams` and `#solveParams` are empty, `#createOut` and `#reveal` are
 *     `display: none`, all four solve stats read `0`/`—`, and every button on
 *     the Solve tab is disabled. Nine of this page's `.mono-box` parameter rows,
 *     both success palettes, both failure palettes and the trapdoor palette
 *     exist only after the puzzle has actually been generated and opened.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This page
 * is one keyframe away from it: `.panel` runs `fade` from `opacity: 0`, and the
 * reduced-motion block turns that animation off outright. It is safe only
 * because `fade` uses the default `fill-mode: none`, so a panel that never
 * animates renders at its own `opacity: 1`. This assertion is what keeps that
 * true if the keyframe or the fill mode ever changes.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 20s turns that silent hang
  // into a named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  await expect(page.locator('#tab-learn')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-learn')).toBeVisible();
  await expect(page.locator('#panel-create')).toBeHidden();
  // Calibration runs on load and rewrites the ETA note; wait for the real text
  // rather than scanning the "appears after the device is calibrated" stub.
  await expect(page.locator('#etaNote')).toContainText('squarings/sec');
  // The panels that carry the lab's claims are genuinely empty here, so a scan
  // at this point proves nothing about them — which is the whole reason
  // `driveAllStates` exists.
  await expect(page.locator('#pubParams')).toBeEmpty();
  await expect(page.locator('#solveParams')).toBeEmpty();
  await expect(page.locator('#createOut')).toBeHidden();
  await expect(page.locator('#reveal')).toBeHidden();

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this lab is a
 * plausible offender: `.param` is a three-column grid whose middle cell is a
 * `white-space: nowrap` monospace box holding an ellipsized 1024-bit modulus,
 * and the modulus-size `<select>` carries option labels 60 characters long.
 * Both are `minmax(0, …)` / `min-width: 0` precisely so this assertion holds.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. That
    // cost a run elsewhere in this fleet, and this lab is full of the same
    // decoy: every `.mono-box` is a nowrap scroller wider than its own box.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    // Prefer an unclipped culprit; fall back to the widest clipped one rather
    // than reporting nothing, so the message always names something to look at.
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Assert a revealed element is wholly on screen and wholly unclipped.
 *
 * Neither axe nor the contrast oracle has anything to say about this, and both
 * are content to measure a box whose right-hand third is not painted. This lab
 * has no popovers, so the oracle is pointed at the blocks that are the whole
 * point of running it: the recovered plaintext in `#reveal` (in both its honest
 * and its trapdoor palette) and the status banner that adjudicates each attempt.
 * Both sit several boxes deep inside a card, next to nine deliberate
 * `overflow-x: auto` scrollers — an `overflow` added one level up would cut
 * them without failing any other assertion here.
 */
export async function expectNotClipped(
  page: Page,
  selector: string,
  label: string
): Promise<void> {
  // Measure the settled frame, the same one `scan` measures.
  await settle(page);
  const cut = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return `no element matched ${sel}`;
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return `${sel} has an empty box`;
    const out: string[] = [];
    if (b.left < -0.5 || b.right > window.innerWidth + 0.5) {
      out.push(`outside the viewport (${Math.round(b.left)}..${Math.round(b.right)} of ${window.innerWidth})`);
    }
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/auto|scroll|hidden|clip/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      const c = n.getBoundingClientRect();
      const lost = Math.max(0, c.left - b.left) + Math.max(0, b.right - c.right) +
        Math.max(0, c.top - b.top) + Math.max(0, b.bottom - c.bottom);
      if (lost > 0.5) {
        out.push(
          `${Math.round(lost)}px clipped by ${n.tagName.toLowerCase()}` +
            `${n.id ? '#' + n.id : ''}.${(n.getAttribute('class') ?? '').trim()}`
        );
      }
    }
    return out.length ? out.join('; ') : null;
  }, selector);
  expect(cut, `${selector} must be fully painted in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Five assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically — which matters more here than in most labs, since
 *    every action button is filled with a `color-mix()` axe declines to
 *    resolve. Everything else in that bucket is a real result axe simply could
 *    not finish — including `aria-prohibited-attr`, which is where an
 *    `aria-label` on a role-less div hides, a defect that never reaches the
 *    violations array at all.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node. Both were being found by hand-sampling screenshot pixels, which does
 * not regress-test.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations in state: ${label}`).toEqual([]);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexplainedIncomplete, `axe incomplete results in state: ${label}`).toEqual([]);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  expect(contrast, `measured contrast failures in state: ${label}`).toEqual([]);

  await expectNoNewNonTextFailures(page, label);
  await expectScrollersReachable(page, label);
  await expectNoHorizontalOverflow(page, label);
}

/** Click a tab and wait for its panel to actually be the visible one. */
async function openTab(page: Page, tab: string, panel: string): Promise<void> {
  await page.locator(`#${tab}`).click();
  await expect(page.locator(`#${tab}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#${panel}`)).toBeVisible();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * The page is six tab panels over one hard prerequisite chain, and the chain is
 * the thing it teaches: nothing can be solved until a puzzle exists, the
 * creator shortcut works only on a puzzle created in THIS tab, and the cheat
 * only has something to reject once a real ciphertext is loaded. So the drive
 * climbs it — four prose panels, then Create with its validation refusal, then
 * a real 512-bit puzzle generated in the worker, then every one of Solve's five
 * outcomes.
 *
 * Two branches are deliberately not driven, because the UI cannot reach them,
 * and they are recorded here so the next reader does not add a click that can
 * only hang:
 *
 *   - `cheat()`'s success path ("Opened — but only because t = 0"). `buttons()`
 *     disables `#cheatBtn` whenever `loaded.t === 0`, so the only puzzle that
 *     could take that branch is the only puzzle whose button is greyed out.
 *   - the `is-fail` branches of `createBtn` and `trapdoorOpen` that report a
 *     thrown worker error or inconsistent parameters. Both require the crypto
 *     itself to fail; there is no UI route, and faking one would be testing a
 *     state the app cannot enter.
 *
 * `is-working` on the Create tab is likewise transient inside one awaited call,
 * so it is not asserted there — but the Solve tab's `is-working` IS scanned,
 * because a large-t solve holds it indefinitely and that is where the four live
 * stats, the progress bar and the chain line are painted.
 *
 * The generated modulus is the smallest the UI offers (512-bit), because the
 * gate is measuring pixels, not factoring difficulty, and a 2048-bit prime
 * search in-browser would put minutes into every one of the four
 * configurations.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);
  // Prime search and the worker round trip are well past the 20s default that
  // `boot` sets for ordinary clicks.
  const HEAVY = { timeout: 120_000 };

  await scanAt('tab 1, what it is');

  // The skip link parks off-screen until focused, so the focused rendering is
  // the only one that paints.
  await page.locator('a.cl-skip-link').focus();
  await scanAt('skip link focused');

  // ── The four prose panels ─────────────────────────────────────────────────
  // Each is `display: none` until its tab is selected, so nothing in them has
  // been measured yet — including the `.note` callouts, which are the only
  // `--text-3` text on a dashed `--border-2` box anywhere on the page.
  await openTab(page, 'tab-security', 'panel-security');
  await expect(page.locator('#panel-security .mono-box')).toBeVisible();
  await scanAt('tab 4, security');

  await openTab(page, 'tab-apps', 'panel-apps');
  await expect(page.locator('#panel-apps li').first()).toBeVisible();
  await scanAt('tab 5, applications');

  await openTab(page, 'tab-vdf', 'panel-vdf');
  await expect(page.locator('#panel-vdf .pill').first()).toBeVisible();
  await scanAt('tab 6, VDFs');

  // ── Create, before anything exists ────────────────────────────────────────
  await openTab(page, 'tab-create', 'panel-create');
  await expect(page.locator('#createStatus')).toHaveClass(/is-idle/);
  await expect(page.locator('#customT')).toBeHidden();
  await scanAt('tab 2, create — idle');

  // The custom-difficulty branch reveals a number input that is hidden in every
  // other state, and re-renders the ETA note from the real calibrated rate.
  await page.locator('#difficulty').selectOption('custom');
  await expect(page.locator('#customT')).toBeVisible();
  await page.locator('#customT').fill('2000');
  await page.locator('#customT').dispatchEvent('input');
  await expect(page.locator('#etaNote')).toContainText('of sequential work');
  await scanAt('create — custom difficulty revealed');

  // The validation refusal: the only `is-fail` banner the Create tab can paint.
  await page.locator('#secret').fill('');
  await page.locator('#createBtn').click();
  await expect(page.locator('#createStatus')).toHaveClass(/is-fail/);
  await expect(page.locator('#createStatus')).toContainText('Enter a secret message first');
  await expectNotClipped(page, '#createStatus', `${theme} / create refused: empty secret`);
  await scanAt('create refused: empty secret');

  // ── A real puzzle ─────────────────────────────────────────────────────────
  await page.locator('#modbits').selectOption('256');
  await page.locator('#secret').fill('Meet me at the old library at noon.');
  await page.locator('#createBtn').click();
  await expect(page.locator('#createStatus')).toHaveClass(/is-ok/, HEAVY);
  await expect(page.locator('#createOut')).toBeVisible();
  await expect(page.locator('#pubParams .param')).toHaveCount(5);
  await expect(page.locator('#pubParams .mono-box').first()).toBeVisible();
  await scanAt('puzzle created, public parameters rendered');

  // ── Solve, with the trapdoor in hand ──────────────────────────────────────
  // `goSolveBtn` switches tabs; the puzzle auto-loads through the state
  // listener, which is the only path that also carries the trapdoor.
  await page.locator('#goSolveBtn').click();
  await expect(page.locator('#panel-solve')).toBeVisible();
  await expect(page.locator('#solveParams .param')).toHaveCount(3);
  await expect(page.locator('#solveStatus')).toContainText('You also hold its trapdoor');
  await expect(page.locator('#trapdoorBtn')).toBeEnabled();
  await scanAt('tab 3, solve — puzzle loaded from create');

  // The trapdoor palette (`is-trapdoor` banner, `.reveal.trap`) exists nowhere
  // else on the page.
  await page.locator('#trapdoorBtn').click();
  await expect(page.locator('#solveStatus')).toHaveClass(/is-trapdoor/, HEAVY);
  await expect(page.locator('#reveal')).toHaveClass(/\btrap\b/);
  await expect(page.locator('#reveal')).toContainText('Meet me at the old library at noon.');
  await expectNotClipped(page, '#reveal', `${theme} / opened via trapdoor`);
  await scanAt('opened instantly via the creator trapdoor');

  // The cheat: submits `a` with zero squarings done, and GCM fails closed.
  await page.locator('#cheatBtn').click();
  await expect(page.locator('#solveStatus')).toHaveClass(/is-fail/, HEAVY);
  await expect(page.locator('#solveStatus')).toContainText('fails closed');
  await expect(page.locator('#reveal')).toBeHidden();
  await scanAt('cheat rejected: AES-GCM fails closed');

  // The honest solve, all the way through, at a t small enough to finish.
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveClass(/is-ok/, HEAVY);
  await expect(page.locator('#statPct')).toHaveText('100%');
  await expect(page.locator('#reveal')).not.toHaveClass(/\btrap\b/);
  await expect(page.locator('#reveal')).toContainText('Recovered message');
  await expectNotClipped(page, '#reveal', `${theme} / solved honestly`);
  await scanAt('solved honestly: all t squarings done');

  // ── The two JSON refusals ─────────────────────────────────────────────────
  const good = (await page.locator('#puzzleJson').inputValue()).trim();
  await page.locator('#puzzleJson').fill('not json at all');
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveStatus')).toContainText('not valid JSON');
  await scanAt('load refused: not JSON');

  await page.locator('#puzzleJson').fill('{"n":"1","a":"0","t":5}');
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveStatus')).toContainText('Invalid puzzle:');
  await scanAt('load refused: invalid parameters');

  // ── A pasted puzzle, i.e. a solver who does NOT hold the trapdoor ─────────
  // Re-loading the same parameters from the textarea produces a different
  // object than the one in session state, so `buttons()` greys the creator
  // shortcut — the state every real solver is in.
  const parsed = JSON.parse(good) as { t: number };
  const bigT = { ...parsed, t: 50_000_000 };
  await page.locator('#puzzleJson').fill(JSON.stringify(bigT, null, 2));
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveStatus')).toContainText('You do not hold the trapdoor');
  await expect(page.locator('#trapdoorBtn')).toBeDisabled();
  await expect(page.locator('#solveBtn')).toBeEnabled();
  await scanAt('pasted puzzle: no trapdoor, full work required');

  // ── Solving in flight ─────────────────────────────────────────────────────
  // 50 million squarings will not finish inside this run, which is the point:
  // it holds the `is-working` banner open while the four stats, the progress
  // bar and the chain line carry live values. Waited on real signals — a step
  // count that has left zero and a rate that has left its placeholder.
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveClass(/is-working/);
  await expect(page.locator('#statSteps')).not.toHaveText('0');
  await expect(page.locator('#statRate')).not.toHaveText('—');
  await expect(page.locator('#chain')).toContainText('mod N');
  await scanAt('solving in flight: live stats and chain');

  await page.locator('#stopBtn').click();
  await expect(page.locator('#solveStatus')).toHaveClass(/is-idle/, HEAVY);
  await expect(page.locator('#solveStatus')).toContainText('The work is not done');
  await expect(page.locator('#solveBtn')).toBeEnabled();
  await scanAt('solve stopped part-way');
}
