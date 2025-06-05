const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const STORAGE_STATE_PATH = "./sessions/storageStateIG.json";
let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("[INFO] Launching browser for Instagram login...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/");
  console.log("[ACTION] Please log in manually in the opened browser...");

  await page.waitForURL("https://www.instagram.com/", { timeout: 0 });
  cachedStorageState = await context.storageState();

  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await fs.writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("[SUCCESS] Session saved to file.");

  await context.close();
}

async function loadCachedStorageState() {
  if (!cachedStorageState) {
    try {
      const data = await fs.readFile(STORAGE_STATE_PATH, "utf-8");
      cachedStorageState = JSON.parse(data);
      console.log("[INFO] Loaded cached session.");
    } catch {
      console.warn("[WARN] No cached session found. Login required.");
    }
  }
}

async function extractPostInfo(context, href, index) {
  const fullUrl = `https://www.instagram.com${href}`;
  const postPage = await context.newPage();

  try {
    await postPage.goto(fullUrl, { timeout: 10000 });
    await postPage.waitForSelector("article header a", { timeout: 5000 });

    const username = await postPage
      .$eval("article header a", (el) => el.innerText)
      .catch(() => "unknown");
    const caption = await postPage
      .$eval("div.C4VMK > span", (el) => el.innerText)
      .catch(() => "");

    return {
      id: index + 1,
      username,
      caption,
      postUrl: fullUrl,
    };
  } catch (err) {
    console.warn(`[WARN] Failed to read post: ${href}`);
    return null;
  } finally {
    await postPage.close();
  }
}

async function searchInstagram(keyword, limit = 20) {
  const browser = await chromium.launch({ headless: false });
  await loadCachedStorageState();

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();
  const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
    keyword
  )}/`;

  await page.goto(searchUrl);
  await page.waitForSelector("article a", { timeout: 10000 });

  const results = new Map();
  let seenLinks = new Set();
  let attempts = 0;

  while (results.size < limit && attempts < 10) {
    const links = await page.$$eval("article a", (anchors) =>
      anchors
        .map((a) => a.getAttribute("href"))
        .filter((href) => href && href.includes("/p/"))
    );

    for (const href of links) {
      if (results.size >= limit || seenLinks.has(href)) continue;
      seenLinks.add(href);

      const postInfo = await extractPostInfo(context, href, results.size);
      if (postInfo) results.set(href, postInfo);
    }

    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
    attempts++;
  }

  await context.close();
  await browser.close();

  return Array.from(results.values()).slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = parseInt(limit, 10) || 20;
    const results = await searchInstagram(q, numLimit);
    res.json({ results });
  } catch (err) {
    console.error("[ERROR] Search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
