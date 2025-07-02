const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateFacebook.json";

let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("เปิด browser เพื่อ login Facebook...");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.facebook.com/login");
  console.log("กรุณาล็อกอินใน browser นี้...");

  await page.waitForURL("https://www.facebook.com/", { timeout: 0 });
  const storage = await context.storageState();
  fs.mkdirSync("./sessions", { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchFacebook(keyword, limit) {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateFacebook.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });

  const postResults = [];
  const keywords = keyword.split(",").map((k) => k.trim());
  const totalKeywords = keywords.length;

  let totalResults = 0;
  let keywordIndex = 0;

  // Keep searching until the limit is reached
  while (totalResults < limit) {
    const currentKeyword = keywords[keywordIndex];

    const task = (async () => {
      const page = await context.newPage();
      const searchUrl = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
        currentKeyword
      )}`;
      await page.goto(searchUrl, { waitUntil: "load" });

      await page.waitForSelector('[role="article"]', { timeout: 10000 });

      const results = [];
      let lastHeight = 0;

      // Scroll and collect posts until the limit is met
      while (results.length < limit && results.length + totalResults < limit) {
        const posts = await page.$$('[role="article"]');

        for (const post of posts) {
          if (results.length >= limit || results.length + totalResults >= limit)
            break;

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

          if (caption !== "unknown") {
            const sentimentResult = await analyzeSentiment(caption);
            if (sentimentResult === "ความคิดเห็นเชิงลบ") {
              if (!results.some((r) => r.postUrl === postUrl)) {
                results.push({
                  username,
                  caption,
                  postUrl,
                  analyzeSentiment: sentimentResult,
                });
              }
            }
          }
        }

        lastHeight = await page.evaluate("document.body.scrollHeight");
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await page.waitForTimeout(2000);

        const newHeight = await page.evaluate("document.body.scrollHeight");
        if (newHeight === lastHeight) break;
      }

      return results.slice(0, limit);
    })();

    const keywordResults = await task;
    postResults.push(...keywordResults);
    totalResults = postResults.length;

    // Switch to the next keyword
    keywordIndex = (keywordIndex + 1) % totalKeywords;

    // If we have reached the limit, break out of the loop
    if (totalResults >= limit) break;
  }

  await context.close();
  await browser.close();

  return postResults.slice(0, limit);
}

// ✅ Express route handler
async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const results = await searchFacebook(q, parseInt(limit) || 10);

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

// ✅ Export both
module.exports = {
  handleSearch,
};
