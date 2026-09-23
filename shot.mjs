import { chromium } from "playwright";
const url = process.argv[2];
const out = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let ok = false;
for (let i = 0; i < 20 && !ok; i++) {
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 8000 });
    if (res && res.status() < 400) {
      const hasError = await page.locator("text=Runtime Error").count().catch(() => 0);
      if (hasError === 0) { ok = true; break; }
    }
  } catch {}
  await page.waitForTimeout(700);
}
if (!ok) { console.log("FAILED to load after retries"); process.exit(1); }
await page.evaluate(() => document.fonts.ready).catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("OK");
