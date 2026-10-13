// SPDX-License-Identifier: AGPL-3.0-or-later
// Audit axe-core (WCAG 2.1 A/AA) de K-Gantt sur plusieurs états de l'interface, thèmes clair et sombre.
const { chromium } = require('playwright');
const fs = require('fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.KGANTT_URL || 'http://localhost:8080/';

async function scan(page, label, include) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async (inc) => {
    const r = await window.axe.run(inc ? { include: [inc] } : document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, ex: v.nodes.slice(0, 3).map((x) => x.target.join(' ') + (x.any[0]?.message ? ' — ' + x.any[0].message.slice(0, 140) : '')) }));
  }, include);
  return { label, res };
}

(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, locale: 'fr-FR' });
    const page = await ctx.newPage();
    await page.goto(BASE);
    out.push(await scan(page, `${theme} · accueil vide`));
    await page.click('.empty [data-action="example"]');
    await page.waitForTimeout(400);
    out.push(await scan(page, `${theme} · exemple chargé`));
    if (theme === 'light') {
      const dialogs = [
        ['tâche', async () => { await page.locator('.g-row').nth(1).locator('.g-wbs').dblclick(); }],
        ['calendrier', async () => { await page.click('[data-action="calendar"]'); }],
        ['ressources', async () => { await page.click('[data-action="resources"]'); }],
        ['export PDF', async () => { await page.click('.menu:has([data-action="export-pdf"]) [data-menu-toggle]'); await page.click('[data-action="export-pdf"]'); }],
        ['iCal', async () => { await page.click('.menu:has([data-action="export-ics"]) [data-menu-toggle]'); await page.click('[data-action="export-ics"]'); }],
        ['aide', async () => { await page.click('[data-action="help"]'); }],
        ['projet', async () => { await page.click('#project-title'); }],
      ];
      for (const [name, open] of dialogs) {
        await open();
        await page.waitForSelector('dialog[open]');
        await page.waitForTimeout(200);
        out.push(await scan(page, `${theme} · fenêtre ${name}`, 'dialog[open]'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
    }
    await page.goto(BASE + 'mentions-legales.php');
    out.push(await scan(page, `${theme} · mentions légales`));
    await ctx.close();
  }
  await browser.close();

  // Agrégation : une ligne par règle, avec les écrans concernés
  const byRule = new Map();
  for (const { label, res } of out) {
    for (const v of res) {
      if (!byRule.has(v.id)) byRule.set(v.id, { ...v, where: [], total: 0 });
      const r = byRule.get(v.id);
      r.where.push(`${label} (${v.n})`);
      r.total += v.n;
    }
  }
  const rules = [...byRule.values()].sort((a, b) => ['critical', 'serious', 'moderate', 'minor'].indexOf(a.impact) - ['critical', 'serious', 'moderate', 'minor'].indexOf(b.impact));
  for (const r of rules) {
    console.log(`\n[${r.impact}] ${r.id} — ${r.help} — ${r.total} élément(s)`);
    console.log('  écrans : ' + r.where.join(' ; '));
    for (const e of r.ex) console.log('  ex : ' + e);
  }
  console.log(`\nTOTAL règles en échec : ${rules.length}, éléments : ${rules.reduce((a, r) => a + r.total, 0)}`);
})();
