const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateFacebook.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login Facebook...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.facebook.com/login");
  console.log("กรุณาล็อกอินใน browser นี้...");

  // รอจนกว่าจะเข้าสู่หน้าแรกของ Facebook (feed)
  // await page.waitForSelector('[role="feed"]', { timeout: 0 });
  await page.waitForURL("https://www.facebook.com/", { timeout: 0 });
  cachedStorageState = await context.storageState();
  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchFacebook(keyword, limit = 10) {
  const browser = await chromium.launch({
    headless: process.env.NODE_ENV === "production",
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateFacebook.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  const searchUrl = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
    keyword
  )}&filters=eyJycF9hdXRob3I6MCI6IntcIm5hbWVcIjpcIm15X2dyb3Vwc19hbmRfcGFnZXNfcG9zdHNcIixcImFyZ3NcIjpcIlwifSJ9`;
  await page.goto(searchUrl);

  await page.waitForSelector('[role="article"]', {
    timeout: 10000,
  });

  const results = [];
  let lastHeight = 0;
  let idCounter = 1;

  while (results.length < limit) {
    const posts = await page.$$('[role="article"]');

    for (const post of posts) {
      if (results.length >= limit) break;

      const username =
        (await post
          .$eval("strong a", (el) => el.innerText)
          .catch(() => null)) ||
        (await post
          .$eval("h3 a, h3 span", (el) => el.innerText)
          .catch(() => null)) ||
        (await post
          .$eval('div[dir="auto"] span', (el) => el.innerText)
          .catch(() => "unknown"));
      const caption = await post
        .$eval('div[dir="auto"]', (el) => el.innerText)
        .catch(() => "unknown");
      const postUrl = await post
        .$eval('a[tabindex="0"]', (a) => a.href)
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
    const results = await searchFacebook(q, numLimit);
    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
