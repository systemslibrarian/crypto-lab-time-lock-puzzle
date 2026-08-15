import { expect, test } from '@playwright/test';
import { boot } from './gate';

/**
 * WCAG 1.4.11 (Non-text Contrast, AA): a text-entry control's boundary must
 * reach 3:1 against at least one adjacent surface, because the border is the
 * only thing that says "this is a field". axe has no rule for it.
 *
 * This lived inside the old a11y spec, where it ran after a `revealAll()` that
 * set `data-active='true'` on all six panels at once — a layout no reader can
 * produce. It is kept, because the oracle is real, but each control is now
 * measured in the state a reader actually meets it in: the Create tab's secret
 * box, difficulty select, custom-t input and modulus select with the Create tab
 * open, and the Solve tab's puzzle textarea with the Solve tab open. A control
 * inside a `display: none` panel has no computed geometry worth measuring, so
 * measuring it there proves nothing.
 */

async function measureControlBorders(
  page: import('@playwright/test').Page
): Promise<Array<{ sel: string; best: number }>> {
  return page.evaluate(() => {
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : [0, 0, 0, 0];
    };
    const comp = (fg: number[], bg: number[]): number[] =>
      [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat([1]);
    const lum = ([r, g, b]: number[]): number => {
      const f = (v: number): number => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]): number => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const effBg = (start: Element | null): number[] => {
      const stack: number[][] = [];
      let node: Element | null = start;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c[3] > 0) stack.push(c);
        if (c[3] >= 1) break;
        node = node.parentElement;
      }
      let bg = [255, 255, 255, 1];
      for (let i = stack.length - 1; i >= 0; i--) bg = comp(stack[i], bg);
      return bg;
    };
    const TEXTY = ['', 'text', 'number', 'password', 'email', 'search', 'url', 'tel'];
    const out: Array<{ sel: string; best: number }> = [];
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.tagName === 'INPUT' && !TEXTY.includes((el.getAttribute('type') || '').toLowerCase()))
        return;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width === 0 || rect.height === 0)
        return;
      if ((parseFloat(cs.borderTopWidth) || 0) === 0) return;
      const outer = effBg(el.parentElement);
      const ownBg = parse(cs.backgroundColor);
      const inner = ownBg[3] >= 1 ? ownBg : comp(ownBg, outer);
      const borderRaw = parse(cs.borderTopColor);
      const best = Math.max(ratio(comp(borderRaw, outer), outer), ratio(comp(borderRaw, inner), inner));
      out.push({
        sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
        best: Math.round(best * 100) / 100,
      });
    });
    return out;
  });
}

for (const theme of ['dark'] as const) {
  test(`text control borders reach 3:1 in ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page, theme);

    await page.locator('#tab-create').click();
    await expect(page.locator('#panel-create')).toBeVisible();
    // The custom-t input is `display: none` in every other state.
    await page.locator('#difficulty').selectOption('custom');
    await expect(page.locator('#customT')).toBeVisible();
    const create = await measureControlBorders(page);
    expect(create.map((r) => r.sel).sort()).toEqual([
      'input#customT',
      'select#difficulty',
      'select#modbits',
      'textarea#secret',
    ]);
    expect(create.filter((r) => r.best < 3)).toEqual([]);

    await page.locator('#tab-solve').click();
    await expect(page.locator('#panel-solve')).toBeVisible();
    const solve = await measureControlBorders(page);
    expect(solve.map((r) => r.sel)).toEqual(['textarea#puzzleJson']);
    expect(solve.filter((r) => r.best < 3)).toEqual([]);
  });
}
