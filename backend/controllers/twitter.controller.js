const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("Launching browser for manual Twitter login...");

  const browser = await chromium.launch({
    headless: false, // allow user to see the login page
    slowMo: 100,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://x.com/i/flow/login");

  try {
    // wait up to 2 minutes for user to login
    await page.waitForURL("https://x.com/home", { timeout: 120000 });
    const storage = await context.storageState();
    fs.mkdirSync("./sessions", { recursive: true });
    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
    console.log("Session saved successfully.");
  } catch (err) {
    console.error("Login timeout or failed. Please try again.");
  }

  await context.close();
  await browser.close();
}

async function searchTwitter(keyword, limitRaw) {
  const limit = parseInt(limitRaw) || 10;
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, "utf-8"));
    console.log("Loaded session from storageStateTwitter.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
    throw new Error("Login required. Please retry after login.");
  }

  const context = await browser.newContext({ storageState: cachedStorageState });
  const page = await context.newPage();

  const searchUrl = `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=live`;
  await page.goto(searchUrl, { waitUntil: "load" });

  try {
    await page.waitForSelector('article div[data-testid="tweetText"]', { timeout: 10000 });
  } catch {
    console.warn("No tweets found or failed to load.");
  }

  const results = [];
  let lastHeight = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 10;

  while (results.length < limit && scrollAttempts < maxScrollAttempts) {
    const tweets = await page.$$("article");

    for (const tweet of tweets) {
      if (results.length >= limit) break;

      const caption = await tweet.$eval('div[data-testid="tweetText"]', el => el.innerText).catch(() => null);
      const postUrl = await tweet.$eval('a[role="link"][href*="/status/"]', el => el.href).catch(() => null);
      const username = await tweet.$eval('div[dir="ltr"] > span', el => el.innerText).catch(() => "unknown");

      if (caption && postUrl && !results.some(r => r.postUrl === postUrl)) {
        const sentiment = await analyzeSentiment(caption);
        if (sentiment === "ความคิดเห็นเชิงลบ") {
          results.push({
            username,
            caption,
            postUrl,
            analyzeSentiment: sentiment,
          });

          console.log(`Negative tweet found: ${caption.slice(0, 40)}...`);
        }
      }
    } // ✅ ปิด for-loop

    // Scroll and wait for new content
    lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) break;

    scrollAttempts++;
  }

  await context.close();
  await browser.close();

  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q=keyword" });
  }

  try {
    const results = await searchTwitter(q, limit);
    res.json({
      keyword: q,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
