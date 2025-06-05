const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateFacebook.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("[INFO] Opening browser for Facebook login...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.facebook.com/login");
  console.log("[ACTION] Please log in manually...");

  await page.waitForURL("https://www.facebook.com/", { timeout: 0 });
  cachedStorageState = await context.storageState();
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await fs.writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("[SUCCESS] Session cached successfully.");

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

async function extractPostData(post) {
  const getText = async (selector) =>
    post.$eval(selector, (el) => el.innerText).catch(() => null);
  const getHref = async (selector) =>
    post.$eval(selector, (el) => el.href).catch(() => null);

  const username = (await getText("h3 a, h3 span")) || "unknown";

  const caption = (await getText('div[dir="auto"]')) || "unknown";
  const postUrl = (await getHref('a[tabindex="0"]')) || "unknown";

  return { username, caption, postUrl };
}

async function searchFacebook(keyword, limit = 20) {
  const browser = await chromium.launch({ headless: false });
  await loadCachedStorageState();

  if (!cachedStorageState) await loginAndCacheSession(browser);

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();
  await page.goto(
    `https://www.facebook.com/search/posts/?q=${encodeURIComponent(keyword)}`
  );

  await page.waitForSelector('[role="article"]', { timeout: 10000 });

  const results = new Map();
  let idCounter = 1;
  let previousHeight = 0;

  while (results.size < limit) {
    const posts = await page.$$('[role="article"]');

    for (const post of posts) {
      if (results.size >= limit) break;
      const { username, caption, postUrl } = await extractPostData(post);

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
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = parseInt(limit, 10) || 20;
    const results = await searchFacebook(q, numLimit);
    res.json({ results });
  } catch (err) {
    console.error("[ERROR] Search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
