import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Strict WCAG regression gate for the Time-Lock Puzzle demo.
 *
 * The app is a single page rendered by main.ts with six tab panels. Inactive
 * panels are display:none, and the Create tab injects its public-parameter rows
 * (each a horizontally-scrollable .mono-box) only after a puzzle is generated.
 * So we DRIVE the Create demo, then force EVERY panel visible, so the
 * dynamically-injected regions are in the DOM and rendered when axe runs.
 *
 * There are no <details> here (panels are class/attribute-toggled). This repo
 * ships no shared-header theme toggle, so the light-theme pass flips the
 * data-theme contract attribute directly (the stylesheet's
 * :root[data-theme="light"] block is what the toggle would swap anyway).
 *
 * Scans WCAG 2.0/2.1 A + AA; asserts zero violations in both themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Neutralize animation/transition/opacity so mid-flight states (panel fade-in)
// can't hide text from the contrast checker.
async function killMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{
      animation-duration:0s!important;animation-delay:0s!important;
      transition-duration:0s!important;transition-delay:0s!important;
      opacity:1!important;scroll-behavior:auto!important;
    }`,
  });
}

// Force every tab panel (and any collapsible) into the visible tree so axe
// scans the whole page in one pass (panels are display:none until active).
async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
    for (const el of document.querySelectorAll<HTMLElement>('[hidden]')) el.removeAttribute('hidden');
    for (const p of document.querySelectorAll<HTMLElement>('.panel')) {
      p.dataset.active = 'true';
      p.style.display = 'block';
    }
    // Reveal the Create output block (display:none until a puzzle is made) and
    // the Solve reveal region so any injected markup is scanned.
    for (const id of ['createOut', 'reveal']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    }
  });
}

// Generate a real puzzle so the public-parameter mono-box rows are injected,
// and exercise the custom-difficulty select branch. Uses the smallest modulus
// + a tiny custom t so it completes fast.
async function driveDemos(page: Page): Promise<void> {
  await page.locator('#tab-create').click();
  await page.locator('#modbits').selectOption('256');
  await page.locator('#difficulty').selectOption('custom');
  await expect(page.locator('#customT')).toBeVisible();
  await page.locator('#customT').fill('2000');
  await page.locator('#secret').fill('axe scan puzzle');
  await page.locator('#createBtn').click();
  // Wait for the injected public parameters (mono-box rows) to render.
  await expect(page.locator('#pubParams .mono-box').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#createStatus.is-ok')).toBeVisible({ timeout: 30_000 });

  // Load the created puzzle into the Solve tab so its params render too.
  await page.locator('#goSolveBtn').click();
  await page.locator('#loadJsonBtn').click();
  await expect(page.locator('#solveParams .mono-box').first()).toBeVisible({ timeout: 15_000 });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#tab-learn')).toBeVisible();
  await killMotion(page);
});

test('no WCAG A/AA violations in dark theme (demos driven)', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await driveDemos(page);
  await killMotion(page);
  await revealAll(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme (demos driven)', async ({ page }) => {
  // No shared-header toggle ships in this repo; flip the data-theme contract
  // attribute the stylesheet keys its light palette off of.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await driveDemos(page);
  await killMotion(page);
  await revealAll(page);
  await scan(page);
});
