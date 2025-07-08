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
  const limit = parseInt(limitRaw);
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("Loaded session from storageStateTwitter.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
    throw new Error("Login required. Please retry after login.");
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  const searchUrl = `https://x.com/search?q=${encodeURIComponent(
    keyword
  )}&src=typed_query&f=live`;
  await page.goto(searchUrl, { waitUntil: "networkidle" });

  try {
    await page.waitForSelector('article div[data-testid="tweetText"]', {
      timeout: 10000,
    });
  } catch {
    console.warn("No tweets found or failed to load.");
  }

  const results = [];
  const seenUrls = new Set();
  let scrollAttempts = 0;

  while (results.length < limit) {
    const tweets = await page.$$("article");
    console.log(`รอบที่ ${scrollAttempts + 1} X: พบ ${tweets.length} โพสต์`);
    for (const tweet of tweets) {
      if (results.length >= limit) break;

      const caption = await tweet
        .$eval('div[data-testid="tweetText"]', (el) => {
          try {
            return (el.innerText || "").replace(/[\r\n]+/g, " ").trim();
          } catch (e) {
            return null;
          }
        })
        .catch(() => null);

      const postUrl = await tweet
        .$eval('a[role="link"][href*="/status/"]', (el) => el.href)
        .catch(() => null);
      const username = await tweet
        .$eval('div[dir="ltr"] > span', (el) => el.innerText)
        .catch(() => "unknown");

      if (!caption || !postUrl || seenUrls.has(postUrl)) continue;
      seenUrls.add(postUrl);

      try {
        const sentiment = await analyzeSentiment(caption);
        if (sentiment === "ความคิดเห็นเชิงลบ") {
          results.push({
            username,
            caption,
            postUrl,
            analyzeSentiment: sentiment,
          });

          console.log(`เก็บโพสต์ X เชิงลบได้ ${results.length}/${limit}`);
        }
      } catch (err) {
        console.error("Sentiment analysis error:", err);
      }
    }

    const lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(5000);

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) {
      console.log("หมดเนื้อหาให้ scroll ของ X แล้ว");

      break;
    }

    scrollAttempts++;
  }

  await context.close();
  await browser.close();

  return results;
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
