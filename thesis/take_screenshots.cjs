/**
 * Берёт скриншоты дашборда через Puppeteer (headless Chrome).
 * Запуск: node take_screenshots.cjs
 * Требует: npm install puppeteer + сервер на http://localhost:5173
 */
const puppeteer = require("puppeteer");
const path = require("path");

const BASE = "http://localhost:5173";
const OUT = path.join(__dirname, "figures");

async function main() {
  console.log("[screenshots] launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  // 1. Find a good track
  console.log("[screenshots] fetching tracks...");
  await page.goto(BASE, { waitUntil: "networkidle2" });

  const trackId = await page.evaluate(async () => {
    const r = await fetch("/api/tracks").then(r => r.json());
    // Pick a ready track with long duration and high genre confidence
    const good = r
      .filter(t => t.status === "ready" && (t.timeline?.metadata?.duration_sec ?? 0) > 100)
      .sort((a, b) => {
        const confA = a.originalName.toLowerCase().includes("just dance") ? 999 : Math.max(...(a.timeline?.genre ?? []).map(g => g.confidence));
        const confB = b.originalName.toLowerCase().includes("just dance") ? 999 : Math.max(...(b.timeline?.genre ?? []).map(g => g.confidence));
        return confB - confA;
      });
    return good[0]?.id ?? null;
  });

  if (!trackId) {
    console.error("[screenshots] no suitable track found!");
    await browser.close();
    return;
  }

  console.log(`[screenshots] navigating to track ${trackId}...`);
  await page.goto(`${BASE}/tracks/${trackId}`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 3000)); // let dashboard render fully

  // 2. Screenshot top part (player + structure)
  console.log("[screenshots] capturing top...");
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "dashboard-top.png"), clip: { x: 0, y: 0, width: 1440, height: 900 } });

  // 3. Screenshot middle (emotion curves + embedding + AV trajectory)
  console.log("[screenshots] capturing mid...");
  await page.evaluate(() => window.scrollTo(0, 700));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "dashboard-mid.png"), clip: { x: 0, y: 0, width: 1440, height: 900 } });

  // 4. Screenshot bottom (genre + spectrogram)
  console.log("[screenshots] capturing bottom...");
  await page.evaluate(() => window.scrollTo(0, 1400));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "dashboard-bottom.png"), clip: { x: 0, y: 0, width: 1440, height: 900 } });

  // 5. Track list page
  console.log("[screenshots] capturing track list...");
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT, "tracklist.png"), clip: { x: 0, y: 0, width: 1440, height: 900 } });

  await browser.close();
  console.log("[screenshots] done! Files in", OUT);

  const fs = require("fs");
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith(".png")) {
      const st = fs.statSync(path.join(OUT, f));
      console.log(`  ${f}: ${(st.size / 1024).toFixed(0)} KB`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
