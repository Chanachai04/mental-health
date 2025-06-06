const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
const MAX_RETRIES = 3;
const SCROLL_DELAY = 2000;
const REQUEST_TIMEOUT = 30000;

let cachedStorageState = null;

// ✅ เพิ่ม rate limiting
class RateLimiter {
  constructor(maxRequests = 5, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      console.log(`[RATE_LIMIT] รอ ${waitTime}ms เพื่อหลีกเลี่ยง rate limit`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter();

// ✅ ปรับปรุง error handling และ retry logic
async function withRetry(fn, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(
        `[RETRY] ความพยายามที่ ${attempt}/${maxRetries} ล้มเหลว:`,
        error.message
      );

      if (attempt === maxRetries) {
        throw new Error(
          `ล้มเหลวหลังจากพยายาม ${maxRetries} ครั้ง: ${error.message}`
        );
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ✅ ปรับปรุงการตรวจสอบ session validity
async function isSessionValid(browser) {
  try {
    const context = await browser.newContext({
      storageState: cachedStorageState,
    });
    const page = await context.newPage();

    await page.goto("https://x.com/home", { timeout: 10000 });

    // ตรวจสอบว่าถูก redirect ไป login หรือไม่
    const currentUrl = page.url();
    const isValid =
      !currentUrl.includes("/login") && !currentUrl.includes("/i/flow/login");

    await context.close();
    return isValid;
  } catch (error) {
    console.warn("[SESSION] ไม่สามารถตรวจสอบ session:", error.message);
    return false;
  }
}

async function loginAndCacheSession(browser) {
  console.log("[INFO] เปิดเบราว์เซอร์สำหรับ login Twitter...");
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("https://twitter.com/login", { timeout: REQUEST_TIMEOUT });
    console.log("[ACTION] กรุณา login ด้วยตนเองในเบราว์เซอร์...");

    // รอจนกว่าจะ login สำเร็จ
    await page.waitForURL("https://x.com/home", { timeout: 0 });
    cachedStorageState = await context.storageState();

    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await fs.writeFile(
      STORAGE_STATE_PATH,
      JSON.stringify(cachedStorageState, null, 2)
    );
    console.log("[SUCCESS] บันทึก Twitter session แล้ว");
  } finally {
    await context.close();
  }
}

async function loadCachedStorageState() {
  if (!cachedStorageState) {
    try {
      const data = await fs.readFile(STORAGE_STATE_PATH, "utf-8");
      cachedStorageState = JSON.parse(data);
      console.log("[INFO] โหลด cached Twitter session แล้ว");
    } catch {
      console.warn("[WARN] ไม่พบ cached Twitter session");
    }
  }
}

// ✅ ปรับปรุงการดึงข้อมูล tweet
async function extractTweetData(tweet) {
  const getText = async (selector) => {
    try {
      return await tweet.$eval(selector, (el) => el.innerText?.trim() || null);
    } catch {
      return null;
    }
  };

  const getHref = async (selector) => {
    try {
      return await tweet.$eval(selector, (el) => el.href);
    } catch {
      return null;
    }
  };

  const getTimestamp = async () => {
    try {
      return await tweet.$eval(
        "time",
        (el) => el.dateTime || el.getAttribute("datetime")
      );
    } catch {
      return null;
    }
  };

  const username = (await getText('div[dir="ltr"] > span')) || "unknown";
  const displayName =
    (await getText('div[data-testid="User-Name"] span')) || "unknown";
  const caption = (await getText('div[data-testid="tweetText"]')) || "unknown";
  const postUrl =
    (await getHref('a[role="link"][href*="/status/"]')) || "unknown";
  const timestamp = await getTimestamp();

  return {
    username,
    displayName,
    caption,
    postUrl,
    timestamp,
  };
}

// ✅ เพิ่ม data validation
function validateTweetData(tweetData) {
  const { username, caption, postUrl } = tweetData;

  // ตรวจสอบว่าไม่ใช่ข้อมูลที่ไม่ต้องการ
  if (
    caption === "unknown" ||
    username === "unknown" ||
    postUrl === "unknown"
  ) {
    return false;
  }

  // ตรวจสอบว่าไม่ใช่โฆษณาหรือ promoted tweet
  if (
    caption.toLowerCase().includes("promoted") ||
    caption.toLowerCase().includes("sponsored")
  ) {
    return false;
  }

  // ตรวจสอบความยาวข้อความ
  if (caption.length < 5 || caption.length > 2000) {
    return false;
  }

  return true;
}

// ✅ ปรับปรุงฟังก์ชันหลัก
async function searchTwitter(keyword, limit = 10, sinceDate, untilDate) {
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // เพิ่มความเสถียร
  });

  try {
    await loadCachedStorageState();

    // ตรวจสอบ session validity
    if (cachedStorageState && !(await isSessionValid(browser))) {
      console.log("[INFO] Session หมดอายุ, ต้อง login ใหม่");
      cachedStorageState = null;
    }

    if (!cachedStorageState) {
      await loginAndCacheSession(browser);
    }

    // Rate limiting
    await rateLimiter.waitIfNeeded();

    const context = await browser.newContext({
      storageState: cachedStorageState,
    });
    const page = await context.newPage();

    // ปรับปรุงการสร้าง query
    let query = `"${keyword}"`; // ใช้ exact match
    if (sinceDate) query += ` since:${sinceDate}`;
    if (untilDate) query += ` until:${untilDate}`;
    query += ` -filter:replies`; // ยกเว้น replies

    const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(
      query
    )}&f=live`;

    await withRetry(async () => {
      await page.goto(searchUrl, { timeout: REQUEST_TIMEOUT });
    });

    // รอให้ tweets โหลด
    await page.waitForSelector('article div[data-testid="tweetText"]', {
      timeout: 15000,
    });

    const results = new Map();
    let idCounter = 1;
    let noNewTweetsCount = 0;
    const maxNoNewTweets = 3;

    while (results.size < limit && noNewTweetsCount < maxNoNewTweets) {
      const previousSize = results.size;
      const tweets = await page.$$("article");

      for (const tweet of tweets) {
        if (results.size >= limit) break;

        try {
          const tweetData = await extractTweetData(tweet);

          if (validateTweetData(tweetData) && !results.has(tweetData.postUrl)) {
            // เพิ่ม sentiment analysis (ถ้า uncomment)
            // const sentiment = await analyzeSentiment(tweetData.caption);

            results.set(tweetData.postUrl, {
              id: idCounter++,
              ...tweetData,
              // sentiment,
              scrapedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.warn("[WARN] ไม่สามารถดึงข้อมูล tweet:", error.message);
        }
      }

      // ตรวจสอบว่ามี tweet ใหม่หรือไม่
      if (results.size === previousSize) {
        noNewTweetsCount++;
      } else {
        noNewTweetsCount = 0;
      }

      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(SCROLL_DELAY);

      console.log(`[INFO] ดึงข้อมูลได้ ${results.size}/${limit} tweets`);
    }

    await context.close();
    return Array.from(results.values()).slice(0, limit);
  } finally {
    await browser.close();
  }
}

// ✅ ปรับปรุง API handler
async function handleSearch(req, res) {
  const { q, limit, since, until } = req.query;

  // Input validation
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return res.status(400).json({
      error: "Missing หรือ invalid ?q=keyword",
    });
  }

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return res.status(400).json({
      error: "limit ต้องเป็นตัวเลข 1-100",
    });
  }

  // Date validation
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return res.status(400).json({
      error: "since date format ต้องเป็น YYYY-MM-DD",
    });
  }

  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return res.status(400).json({
      error: "until date format ต้องเป็น YYYY-MM-DD",
    });
  }

  try {
    const numLimit = parseInt(limit, 10) || 10;
    const startTime = Date.now();

    console.log(`[INFO] เริ่มค้นหา: "${q}" (limit: ${numLimit})`);

    const results = await searchTwitter(q.trim(), numLimit, since, until);

    const duration = Date.now() - startTime;
    console.log(
      `[SUCCESS] ค้นหาเสร็จใน ${duration}ms, ได้ ${results.length} tweets`
    );

    res.json({
      results,
      metadata: {
        query: q.trim(),
        limit: numLimit,
        since,
        until,
        totalFound: results.length,
        searchDuration: duration,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[ERROR] Search failed:", err);
    res.status(500).json({
      error: "Search failed",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

module.exports = {
  handleSearch,
  searchTwitter, // Export สำหรับ testing
};
