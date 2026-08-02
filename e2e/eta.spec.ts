import { expect, test } from '@playwright/test';

/**
 * The calibration loop's accumulated value used to be dead after the timing
 * loop, so the bundler removed the squarings it existed to measure. Calibration
 * reported 14.5 billion squarings/sec against the Solve tab's own counter of
 * roughly 640 thousand in the same session, and every difficulty rendered
 * "≈ <1s" — in a demo whose whole subject is elapsed time.
 */
test('calibration reports a physically plausible rate', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-create').click();
  const note = page.locator('#etaNote');
  await expect(note).toContainText(/squarings\/sec/);

  const text = (await note.textContent()) ?? '';
  const rate = Number((text.match(/~([\d,]+) squarings\/sec/)?.[1] ?? '0').replace(/,/g, ''));
  expect(rate, 'no rate rendered').toBeGreaterThan(0);
  // Sequential BigInt modular squaring in a browser is a microseconds-scale
  // operation. Anything past ~200M/sec means the loop was optimised away.
  expect(rate, `implausible calibrated rate ${rate}/sec — the timing loop was eliminated`)
    .toBeLessThan(200_000_000);
  expect(rate).toBeGreaterThan(10_000);
});

test('the ETA scales with t instead of reading "<1s" for everything', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-create').click();

  const difficulty = page.locator('#difficulty');
  const customT = page.locator('#customT');
  const note = page.locator('#etaNote');
  await expect(difficulty).toBeVisible();

  // The built-in presets top out at 1,000,000 steps, which really is sub-second
  // on current hardware — so the preset list alone cannot detect the bug. Drive
  // the custom field across four orders of magnitude: with the timing loop
  // eliminated every one of these rendered "<1s".
  await difficulty.selectOption('custom');
  await expect(customT).toBeVisible();

  const readings: string[] = [];
  for (const t of ['1000000', '100000000', '10000000000']) {
    await customT.fill(t);
    await customT.dispatchEvent('input');
    const text = (await note.textContent()) ?? '';
    readings.push((text.match(/≈\s*([^ ]+(?: [^ ]+)?) of sequential/)?.[1] ?? '').trim());
  }

  expect(
    new Set(readings).size,
    `t spanning 1e6 to 1e10 all rendered the same ETA (${readings.join(' | ')})`,
  ).toBeGreaterThan(1);
  expect(
    readings[readings.length - 1],
    `the largest t still reads sub-second (${readings.join(' | ')})`,
  ).not.toMatch(/<1s/);
});
