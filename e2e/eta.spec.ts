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

test('the VDF comparison points at the lab that has the proof, not a future one', async ({
  page,
}) => {
  // The panel used to end "A future Crypto Lab demo can build that proof on top
  // of exactly these parameters." crypto-lab-vdf exists and does exactly that
  // (repeated squaring plus the Wesolowski short proof), so the sentence was
  // promising something already shipped.
  await page.goto('.');
  await page.locator('#tab-vdf').click();
  const panel = page.locator('#panel-vdf');
  await expect(panel).toBeVisible();
  const text = (await panel.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toContain('A future Crypto Lab demo');
  expect(text).toContain('That proof exists in this suite');
  await expect(
    panel.locator('a[href="https://systemslibrarian.github.io/crypto-lab-vdf/"]'),
  ).toHaveCount(1);
});

test('custom work must be a whole count and the result distinguishes an explicit zero', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-create').click();
  await page.locator('#difficulty').selectOption('custom');
  await page.locator('#modbits').selectOption('256');
  for (const raw of ['', '-2', '1.5', '9007199254740992']) {
    await page.locator('#customT').fill(raw);
    await page.locator('#createBtn').click();
    await expect(page.locator('#createStatus')).toContainText('whole number');
    await expect(page.locator('#customT')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#puzzleJson')).toHaveValue('');
  }
  await page.locator('#customT').fill('0');
  await page.locator('#createBtn').click();
  await expect(page.locator('#createStatus')).toContainText('zero squarings');
  expect(JSON.parse(await page.locator('#puzzleJson').inputValue()).t).toBe(0);
});

test('loading another puzzle retires the previous message, pending solve and counters', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-create').click();
  await page.locator('#difficulty').selectOption('custom');
  await page.locator('#modbits').selectOption('256');
  await page.locator('#customT').fill('17');
  await page.locator('#createBtn').click();
  await page.locator('#goSolveBtn').click();
  const input = page.locator('#puzzleJson');
  const original = await input.inputValue();
  await page.locator('#solveBtn').click();
  await expect(page.locator('#reveal')).toContainText('old library at noon');
  await input.fill('unfinished');
  await expect(page.locator('#reveal')).toBeEmpty();
  await expect(page.locator('#solveBtn')).toBeDisabled();
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveStatus')).toContainText('not valid JSON');
  await expect(page.locator('#solveParams')).toBeEmpty();
  const parsed = JSON.parse(original);
  await input.fill(JSON.stringify({ ...parsed, t: 5_000_000, modulusBits: 99 }));
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveParams')).toContainText(BigInt(parsed.n).toString(2).length + '-bit');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#statSteps')).not.toHaveText('0');
  await input.fill(original);
  await page.locator('#loadJsonBtn').click();
  await page.locator('#solveBtn').click();
  await expect(page.locator('#reveal')).toContainText('old library at noon');
  await expect(page.locator('#statSteps')).toHaveText('17');
});
