const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

const STORAGE_STATE_PATH = "./sessions/storageStateFacebook.json";
const MAX_RETRIES = 3;
const SCROLL_DELAY = 3000; // Facebook ต้องใช้เวลานานกว่า
const REQUEST_TIMEOUT = 45000; // Facebook โหลดช้ากว่า
const MAX_SCROLL_ATTEMPTS = 10;

let cachedStorageState = null;

// ✅ เพิ่ม rate limiting เข้มงวดกว่าสำหรับ Facebook
class FacebookRateLimiter {
  constructor(maxRequests = 3, windowMs = 120000) {
    // น้อยกว่า Twitter
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
    this.isBlocked = false;
    this.blockUntil = null;
  }

  async waitIfNeeded() {
    // ตรวจสอบว่าถูก block หรือไม่
    if (this.isBlocked && this.blockUntil && Date.now() < this.blockUntil) {
      const waitTime = this.blockUntil - Date.now();
      console.log(
        `[RATE_LIMIT] Facebook blocked, รอ ${Math.ceil(waitTime / 1000)}วินาที`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.isBlocked = false;
      this.blockUntil = null;
    }

    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      console.log(
        `[RATE_LIMIT] รอ ${Math.ceil(
          waitTime / 1000
        )}วินาที เพื่อหลีกเลี่ยง Facebook rate limit`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }

  markAsBlocked(durationMs = 300000) {
    // Block 5 นาที
    this.isBlocked = true;
    this.blockUntil = Date.now() + durationMs;
  }
}

const rateLimiter = new FacebookRateLimiter();

// ✅ เพิ่ม User-Agent rotation และ browser fingerprinting
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ✅ ปรับปรุง error handling และ retry logic
async function withRetry(fn, maxRetries = MAX_RETRIES, context = null) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(
        `[RETRY] ความพยายามที่ ${attempt}/${maxRetries} ล้มเหลว:`,
        error.message
      );

      // ตรวจสอบว่าเป็น Facebook security challenge หรือไม่
      if (context && (await isSecurityChallenge(context))) {
        console.error("[SECURITY] พบ Facebook security challenge");
        rateLimiter.markAsBlocked(600000); // Block 10 นาที
        throw new Error("Facebook security challenge detected");
      }

      if (attempt === maxRetries) {
        throw new Error(
          `ล้มเหลวหลังจากพยายาม ${maxRetries} ครั้ง: ${error.message}`
        );
      }

      // Exponential backoff with jitter
      const baseDelay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      const jitter = Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
}

// ✅ ตรวจสอบ Facebook security challenges
async function isSecurityChallenge(page) {
  try {
    const challengeSelectors = [
      '[data-testid="sec_ac_challenge"]',
      '[data-testid="checkpoint_challenge"]',
      'div[role="dialog"][aria-label*="Security"]',
      'div[role="dialog"][aria-label*="Verify"]',
      'form[data-testid="verification_form"]',
    ];

    for (const selector of challengeSelectors) {
      if (await page.$(selector)) {
        return true;
      }
    }

    // ตรวจสอบ URL patterns
    const url = page.url();
    return (
      url.includes("/checkpoint/") ||
      url.includes("/security/") ||
      url.includes("/verification/")
    );
  } catch {
    return false;
  }
}

// ✅ ปรับปรุงการตรวจสอบ session validity
async function isSessionValid(browser) {
  try {
    const context = await browser.newContext({
      storageState: cachedStorageState,
    });
    const page = await context.newPage();

    await page.goto("https://www.facebook.com/", { timeout: 15000 });

    // รอให้โหลดเสร็จ
    await page.waitForTimeout(3000);

    // ตรวจสอบว่าถูก redirect ไป login หรือไม่
    const currentUrl = page.url();
    const isLoginPage =
      currentUrl.includes("/login") ||
      currentUrl.includes("/auth") ||
      currentUrl === "https://www.facebook.com/login.php";

    // ตรวจสอบว่ามี login form หรือไม่
    const hasLoginForm =
      (await page.$('input[name="email"]')) ||
      (await page.$('input[data-testid="royal_email"]'));

    const isValid = !isLoginPage && !hasLoginForm;

    await context.close();
    return isValid;
  } catch (error) {
    console.warn("[SESSION] ไม่สามารถตรวจสอบ session:", error.message);
    return false;
  }
}

async function loginAndCacheSession(browser) {
  console.log("[INFO] เปิดเบราว์เซอร์สำหรับ login Facebook...");
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1366, height: 768 }, // ขนาดหน้าจอปกติ
  });
  const page = await context.newPage();

  try {
    await page.goto("https://www.facebook.com/login", {
      timeout: REQUEST_TIMEOUT,
      waitUntil: "domcontentloaded",
    });

    console.log("[ACTION] กรุณา login ด้วยตนเองในเบราว์เซอร์...");
    console.log("[INFO] กรุณารอจนกว่าจะเข้าสู่หน้าหลักของ Facebook");

    // รอจนกว่าจะ login สำเร็จ (ใช้ timeout 0 เพื่อรอไม่จำกัดเวลา)
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        return (
          url === "https://www.facebook.com/" ||
          url.startsWith("https://www.facebook.com/?")
        );
      },
      { timeout: 0 }
    );

    // รอให้หน้าโหลดเสร็จ
    await page.waitForTimeout(5000);

    cachedStorageState = await context.storageState();

    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await fs.writeFile(
      STORAGE_STATE_PATH,
      JSON.stringify(cachedStorageState, null, 2)
    );
    console.log("[SUCCESS] บันทึก Facebook session แล้ว");
  } finally {
    await context.close();
  }
}

async function loadCachedStorageState() {
  if (!cachedStorageState) {
    try {
      const data = await fs.readFile(STORAGE_STATE_PATH, "utf-8");
      cachedStorageState = JSON.parse(data);
      console.log("[INFO] โหลด cached Facebook session แล้ว");
    } catch {
      console.warn("[WARN] ไม่พบ cached Facebook session");
    }
  }
}

// ✅ ปรับปรุงการดึงข้อมูล Facebook post
async function extractPostData(post) {
  const getText = async (selector) => {
    try {
      return await post.$eval(selector, (el) => el.innerText?.trim() || null);
    } catch {
      return null;
    }
  };

  const getHref = async (selector) => {
    try {
      return await post.$eval(selector, (el) => el.href);
    } catch {
      return null;
    }
  };

  // Facebook มี selector ที่ซับซ้อนกว่า Twitter
  const usernameSelectors = [
    "h3 a strong",
    "h3 span strong",
    "h3 a span",
    'strong[dir="auto"]',
    'span[dir="auto"] strong',
  ];

  const captionSelectors = [
    'div[dir="auto"][style*="text-align"]',
    'div[data-ad-preview="message"]',
    'div[dir="auto"]:not([role]):not([aria-label])',
    'span[dir="auto"][lang]',
  ];

  const urlSelectors = [
    'a[tabindex="0"]',
    // 'a[tabindex="0"][href*="/posts/"]',
    'a[href*="/photo"]',
    'a[href*="/story"]',
    'a[role="link"][href*="facebook.com"]',
  ];

  let username = "unknown";
  for (const selector of usernameSelectors) {
    username = await getText(selector);
    if (username && username !== "unknown") break;
  }

  let caption = "unknown";
  for (const selector of captionSelectors) {
    caption = await getText(selector);
    if (caption && caption !== "unknown" && caption.length > 10) break;
  }

  let postUrl = "unknown";
  for (const selector of urlSelectors) {
    postUrl = await getHref(selector);
    if (postUrl && postUrl !== "unknown") break;
  }

  return {
    username,
    caption,
    postUrl,
  };
}

// ✅ เพิ่ม data validation สำหรับ Facebook
function validateFacebookPostData(postData) {
  const { username, caption, postUrl } = postData;

  if (
    caption === "unknown" ||
    username === "unknown" ||
    postUrl === "unknown"
  ) {
    return false;
  }

  // ตรวจสอบว่าไม่ใช่โฆษณา
  if (
    caption.toLowerCase().includes("sponsored") ||
    caption.toLowerCase().includes("promoted") ||
    caption.includes("สนับสนุนโดย")
  ) {
    return false;
  }

  // ตรวจสอบความยาวข้อความ
  if (caption.length < 10 || caption.length > 5000) {
    return false;
  }

  // ตรวจสอบว่าไม่ใช่ระบบแจ้งเตือน
  if (
    caption.includes("updated their") ||
    caption.includes("changed their") ||
    caption.includes("ได้อัปเดต")
  ) {
    return false;
  }

  return true;
}

// ✅ ปรับปรุงฟังก์ชันหลัก
async function searchFacebook(keyword, limit = 20, dateFilter = null) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
    ],
  });

  try {
    await loadCachedStorageState();

    // ตรวจสอบ session validity
    if (cachedStorageState && !(await isSessionValid(browser))) {
      console.log("[INFO] Facebook session หมดอายุ, ต้อง login ใหม่");
      cachedStorageState = null;
    }

    if (!cachedStorageState) {
      await loginAndCacheSession(browser);
    }

    // Rate limiting
    await rateLimiter.waitIfNeeded();

    const context = await browser.newContext({
      storageState: cachedStorageState,
      userAgent: getRandomUserAgent(),
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();

    // ซ่อนว่าเป็น automation
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // สร้าง search URL
    let searchUrl = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
      keyword
    )}`;
    if (dateFilter) {
      searchUrl += `&filters=${encodeURIComponent(dateFilter)}`;
    }

    await withRetry(
      async () => {
        await page.goto(searchUrl, {
          timeout: REQUEST_TIMEOUT,
          waitUntil: "domcontentloaded",
        });
      },
      MAX_RETRIES,
      page
    );

    // รอให้ posts โหลด
    await page.waitForSelector('[role="article"]', {
      timeout: 20000,
    });

    // ตรวจสอบ security challenge
    if (await isSecurityChallenge(page)) {
      throw new Error("Facebook security challenge detected");
    }

    const results = new Map();
    let idCounter = 1;
    let scrollAttempts = 0;
    let noNewPostsCount = 0;
    const maxNoNewPosts = 3;

    while (
      results.size < limit &&
      scrollAttempts < MAX_SCROLL_ATTEMPTS &&
      noNewPostsCount < maxNoNewPosts
    ) {
      const previousSize = results.size;

      // รอให้โหลดเพิ่มเติม
      await page.waitForTimeout(SCROLL_DELAY);

      const posts = await page.$$('[role="article"]');
      console.log(`[INFO] พบ ${posts.length} posts ในหน้านี้`);

      for (const [index, post] of posts.entries()) {
        if (results.size >= limit) break;

        try {
          const postData = await extractPostData(post);

          if (
            validateFacebookPostData(postData) &&
            !results.has(postData.postUrl)
          ) {
            // เพิ่ม sentiment analysis (ถ้า uncomment)
            // const sentiment = await analyzeSentiment(postData.caption);

            results.set(postData.postUrl, {
              id: idCounter++,
              ...postData,
              // sentiment,
              scrapedAt: new Date().toISOString(),
            });

            console.log(`[SUCCESS] ดึงข้อมูล post ${results.size}/${limit}`);
          }
        } catch (error) {
          console.warn(
            `[WARN] ไม่สามารถดึงข้อมูล post ${index + 1}:`,
            error.message
          );
        }
      }

      // ตรวจสอบว่ามี post ใหม่หรือไม่
      if (results.size === previousSize) {
        noNewPostsCount++;
        console.log(
          `[INFO] ไม่มี post ใหม่ (${noNewPostsCount}/${maxNoNewPosts})`
        );
      } else {
        noNewPostsCount = 0;
      }

      // Scroll down
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      scrollAttempts++;
      console.log(
        `[INFO] Scroll ครั้งที่ ${scrollAttempts}/${MAX_SCROLL_ATTEMPTS}, ได้ ${results.size}/${limit} posts`
      );
    }

    await context.close();
    return Array.from(results.values()).slice(0, limit);
  } finally {
    await browser.close();
  }
}

// ✅ ปรับปรุง API handler
async function handleSearch(req, res) {
  const { q, limit, date_filter } = req.query;

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

  try {
    const numLimit = parseInt(limit, 10) || 10;
    const startTime = Date.now();

    console.log(`[INFO] เริ่มค้นหา Facebook: "${q}" (limit: ${numLimit})`);

    const results = await searchFacebook(q.trim(), numLimit, date_filter);

    const duration = Date.now() - startTime;
    console.log(
      `[SUCCESS] ค้นหา Facebook เสร็จใน ${duration}ms, ได้ ${results.length} posts`
    );

    res.json({
      results,
      // metadata: {
      //   query: q.trim(),
      //   limit: numLimit,
      //   dateFilter: date_filter,
      //   totalFound: results.length,
      //   searchDuration: duration,
      //   timestamp: new Date().toISOString(),
      //   platform: "Facebook",
      // },
    });
  } catch (err) {
    console.error("[ERROR] Facebook search failed:", err);

    if (err.message.includes("security challenge")) {
      res.status(429).json({
        error: "Facebook security challenge detected",
        suggestion: "กรุณารอสักครู่แล้วลองใหม่ หรือตรวจสอบบัญชี Facebook",
      });
    } else {
      res.status(500).json({
        error: "Facebook search failed",
        details:
          process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
}

module.exports = {
  handleSearch,
  searchFacebook, // Export สำหรับ testing
};
