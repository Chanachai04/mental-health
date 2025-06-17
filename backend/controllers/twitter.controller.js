const fs = require("fs");
const { chromium } = require("playwright");
// const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login Twitter...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://twitter.com/login");
  console.log("กรุณาล็อกอินใน browser นี้...");

  // รอจนกว่าจะเห็น feed หรือหน้า home ของ Twitter (login สำเร็จ)
  // await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 0 });
  await page.waitForURL("https://www.twitter.com/", { timeout: 0 });

  cachedStorageState = await context.storageState();

  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("บันทึก session ลงไฟล์สำเร็จ");

  // ไม่ปิด context เพื่อให้ session ค้างไว้ (ตามแต่ถ้าอยากปิดให้แก้)
  await context.close();
}

async function searchTwitter(keyword, limit = 10, sinceDate, untilDate) {
  const browser = await chromium.launch({
    headless: process.env.NODE_ENV === "production",
  });

  // โหลด session จากไฟล์ ถ้ายังไม่มีใน memory
  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateTwitter.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  // สร้าง query string สำหรับ date filter
  let query = keyword;
  if (sinceDate) query += ` since:${sinceDate}`;
  if (untilDate) query += ` until:${untilDate}`;

  const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(
    query
  )}&f=live`;
  await page.goto(searchUrl);

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
      // Ai Gemini
      // const sentiment = await analyzeSentiment(caption);
      // if (caption !== "unknown") {
      //     if (!results.some((r) => r.contact === postUrl)) {
      //         results.push({id: idCounter++, username, caption, sentiment, postUrl});
      //     }
      // }

      if (caption !== "unknown") {
        if (!results.some((r) => r.contact === postUrl)) {
          results.push({ id: idCounter++, username, caption, postUrl });
        }
      }
    }

    lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) break; // เลื่อนจนสุดแล้ว
  }

  // เมื่อเสร็จแล้วปิด context
  await context.close();
  await browser.close();

  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit, since, until } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = limit ? parseInt(limit) : 10;
    const results = await searchTwitter(q, numLimit, since, until);
    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
