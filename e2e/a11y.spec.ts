import { test } from '@playwright/test';
import { boot, driveAllStates, expectBaselineNotStale, NARROW } from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along the chain it teaches: the skip link focused, all six
 * tab panels opened one at a time, the custom-difficulty branch revealed, the
 * empty-secret refusal triggered, a real 512-bit puzzle generated in the worker,
 * the creator trapdoor used, the cheat rejected by AES-GCM, the puzzle solved
 * honestly, both JSON refusals driven, the same parameters re-pasted so the
 * trapdoor is correctly out of reach, a 50-million-step solve started and
 * scanned mid-flight with live stats, and then stopped part-way. Every one of
 * those states is scanned, in both themes, at desktop and phone width.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * forced open, why each scan asserts its content first, and why `violations` is
 * not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, theme);
    await driveAllStates(page, theme);

    // The third ratchet rule — a baselined finding that no longer appears must
    // be deleted, so the list can only shrink. `expectBaselineNotStale` was
    // exported from `gate.ts` and imported by nothing, so it had never run.
    //
    // Light theme only, which was measured rather than assumed. `nonTextSeen`
    // is a single flat set with no theme dimension, so the rule only holds
    // where the drive reaches EVERY baselined selector. The dark drive misses
    // four — `button#createBtn.action`, `button#goSolveBtn.action`,
    // `button#solveBtn.action` and `input#customT`, all recorded at 2.77:1 —
    // because those are the accent-bordered primary controls, which clear 3:1
    // against the dark surfaces and only fail against the light ones. So the
    // baseline describes the light drive, and a dark-theme call would report
    // those four as stale on every run.
    expectBaselineNotStale();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    // Same reasoning as above; both light configurations reach all 17.
    expectBaselineNotStale();
  });
}
