const fs = require("fs");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
const { analyzeSentiment } = require("../utils/sentiment");

let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("เปิด browser เพื่อ login Twitter...");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://x.com/i/flow/login");
  console.log("กรุณาล็อกอินใน browser นี้...");

  await page.waitForURL("https://x.com/home", { timeout: 0 });
  const storage = await context.storageState();
  fs.mkdirSync("./sessions", { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchTwitter(keyword, limit = 10) {
  const browser = await chromium.launch({
    headless: process.env.NODE_ENV === "production",
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateTwitter.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();
  const searchUrl = `https://x.com/search?q=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: "load" });

  await page.waitForSelector('article div[data-testid="tweetText"]', {
    timeout: 10000,
  });

  const results = [];
  let lastHeight = 0;
  let idCounter = 1;

  while (results.length < limit) {
    const tweets = await page.$$("article");

    for (const tweet of tweets) {
      if (results.length >= limit) break;

      const username = await tweet
        .$eval('div[dir="ltr"] > span', (el) => el.innerText)
        .catch(() => "unknown");
      const caption = await tweet
        .$eval('div[data-testid="tweetText"]', (el) => el.innerText)
        .catch(() => "unknown");
      const postUrl = await tweet
        .$eval('a[role="link"][href*="/status/"]', (a) => a.href)
        .catch(() => "unknown");

      if (caption !== "unknown" && postUrl !== "unknown") {
        if (!results.some((r) => r.postUrl === postUrl)) {
          // เรียกวิเคราะห์ความรู้สึก
          const sentimentResult = await analyzeSentiment(caption);
          const sentiment =
            typeof sentimentResult === "string"
              ? sentimentResult
              : sentimentResult.result || "ไม่สามารถระบุได้";

          results.push({
            id: idCounter++,
            username,
            caption,
            postUrl,
            sentiment,
          });
        }
      }
    }

    lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) break;
  }

  await context.close();
  await browser.close();

  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = limit ? parseInt(limit) : 10;
    const results = await searchTwitter(q, numLimit);

    res.json({
      keyword: q,
      total: results.length,
      results: results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
