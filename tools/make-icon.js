// Redraws store/icon.png from the game's own sprites.
// Needs Node and Playwright with Chromium:  node tools/make-icon.js
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 544 } });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.BOOM.showIcon());
  await page.waitForTimeout(200);
  // The canvas fills the 960x544 window; the icon is its middle 544x544 square.
  await page.screenshot({ path: path.join(__dirname, '..', 'store', 'icon.png'), clip: { x: 208, y: 0, width: 544, height: 544 } });
  await browser.close();
  console.log('Wrote store/icon.png');
})();
