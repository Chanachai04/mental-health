const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("[INFO] Opening browser for Twitter login...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://twitter.com/login");
  console.log("[ACTION] Please log in manually in the opened browser...");

  await page.waitForURL("https://x.com/home", { timeout: 0 });
  cachedStorageState = await context.storageState();

  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await fs.writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("[SUCCESS] Twitter session cached.");

  await context.close();
}

async function loadCachedStorageState() {
  if (!cachedStorageState) {
    try {
      const data = await fs.readFile(STORAGE_STATE_PATH, "utf-8");
      cachedStorageState = JSON.parse(data);
      console.log("[INFO] Loaded cached Twitter session.");
    } catch {
      console.warn("[WARN] No cached Twitter session found.");
    }
  }
}

async function extractTweetData(tweet) {
  const getText = async (selector) =>
    tweet.$eval(selector, (el) => el.innerText).catch(() => null);
  const getHref = async (selector) =>
    tweet.$eval(selector, (el) => el.href).catch(() => null);

  const username = (await getText('div[dir="ltr"] > span')) || "unknown";
  const caption = (await getText('div[data-testid="tweetText"]')) || "unknown";
  const postUrl =
    (await getHref('a[role="link"][href*="/status/"]')) || "unknown";

  return { username, caption, postUrl };
}

async function searchTwitter(keyword, limit = 10, sinceDate, untilDate) {
  const browser = await chromium.launch({ headless: false });
  await loadCachedStorageState();

  if (!cachedStorageState) await loginAndCacheSession(browser);

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

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

  const results = new Map();
  let idCounter = 1;
  let previousHeight = 0;

  while (results.size < limit) {
    const tweets = await page.$$("article");

    for (const tweet of tweets) {
      if (results.size >= limit) break;

      const { username, caption, postUrl } = await extractTweetData(tweet);

      if (caption !== "unknown" && !results.has(postUrl)) {
        results.set(postUrl, { id: idCounter++, username, caption, postUrl });
      }
    }

    previousHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
  }

  await context.close();
  await browser.close();

  return Array.from(results.values()).slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit, since, until } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = parseInt(limit, 10) || 10;
    const results = await searchTwitter(q, numLimit, since, until);
    res.json({ results });
  } catch (err) {
    console.error("[ERROR] Search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
