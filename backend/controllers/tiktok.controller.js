const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

const CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT: 30000,
  SCROLL_TIMES: 2,
  REQUEST_DELAY: { min: 1500, max: 3500 },
};

// User Agent pool
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
];

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ANTI_DETECTION_SCRIPT = `
(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', {
    get: () => [{
      description: "Portable Document Format",
      filename: "internal-pdf-viewer",
      name: "Chrome PDF Plugin"
    }],
  });
  
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
})();
`;

class RateLimiter {
  constructor(tokensPerSecond = 0.5, bucketSize = 3) {
    this.tokensPerSecond = tokensPerSecond;
    this.bucketSize = bucketSize;
    this.tokens = bucketSize;
    this.lastRefill = Date.now();
  }

  async acquireToken() {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }

    const waitTime = ((1 - this.tokens) / this.tokensPerSecond) * 1000;
    await sleep(waitTime);
    return this.acquireToken();
  }

  refillTokens() {
    const now = Date.now();
    const timeSinceLastRefill = (now - this.lastRefill) / 1000;
    const tokensToAdd = timeSinceLastRefill * this.tokensPerSecond;
    this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

const rateLimiter = new RateLimiter();

class BrowserSessionManager {
  constructor() {
    this.activeSessions = new Map();
    this.sessionCounter = 0;
  }

  async createSession() {
    const sessionId = `session_${++this.sessionCounter}`;
    const viewport = getRandomElement(VIEWPORTS);

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        `--window-size=${viewport.width},${viewport.height}`,
      ],
    });

    const context = await browser.newContext({
      viewport,
      userAgent: getRandomElement(USER_AGENTS),
      extraHTTPHeaders: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
    });

    await context.addInitScript(ANTI_DETECTION_SCRIPT);
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();

      if (
        resourceType === "image" ||
        resourceType === "media" ||
        resourceType === "font" ||
        url.includes("ads") ||
        url.includes("analytics")
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });

    this.activeSessions.set(sessionId, { browser, context, page });
    return { sessionId, page };
  }

  async closeSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      try {
        await session.browser.close();
      } catch (error) {
        console.warn(`Error closing session ${sessionId}:`, error.message);
      }
      this.activeSessions.delete(sessionId);
    }
  }

  async closeAllSessions() {
    const closePromises = Array.from(this.activeSessions.keys()).map(
      (sessionId) => this.closeSession(sessionId)
    );
    await Promise.allSettled(closePromises);
  }
}

const sessionManager = new BrowserSessionManager();

class TikTokScraper {
  constructor() {
    this.requestCount = 0;
  }

  async scrapeKeyword(keyword, limit) {
    await rateLimiter.acquireToken();
    let sessionId = null;

    try {
      console.log(
        `[${++this.requestCount}] Searching: "${keyword}" (limit: ${limit})`
      );

      const session = await sessionManager.createSession();
      sessionId = session.sessionId;
      const page = session.page;

      await page.goto("https://www.tiktok.com", {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.TIMEOUT,
      });

      await sleep(2000);
      await this.checkForBlocking(page);

      const results = await this.performSearch(page, keyword, limit);
      console.log(`Success: Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`Error:`, error.message);
      throw error;
    } finally {
      if (sessionId) {
        await sessionManager.closeSession(sessionId);
      }
    }
  }

  async performSearch(page, keyword, limit) {
    try {
      await page.waitForSelector(
        '[data-testid="search-icon"], [aria-label*="Search"]',
        {
          timeout: 10000,
        }
      );

      await page.click('[data-testid="search-icon"], [aria-label*="Search"]');

      await page.waitForSelector(
        'input[placeholder*="Search"], [data-testid="search-input"]',
        {
          timeout: 5000,
        }
      );

      await page.fill(
        'input[placeholder*="Search"], [data-testid="search-input"]',
        keyword
      );
      await page.keyboard.press("Enter");
    } catch (error) {
      console.log("Using direct URL navigation");
      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(
        keyword
      )}`;
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.TIMEOUT,
      });
    }

    await sleep(3000);
    await this.checkForBlocking(page);

    for (let i = 0; i < CONFIG.SCROLL_TIMES; i++) {
      await sleep(randomDelay(800, 2000));
      await page.evaluate(() => {
        window.scrollBy({ top: Math.random() * 400 + 300, behavior: "smooth" });
      });
    }

    return await this.extractVideoData(page, limit);
  }

  async checkForBlocking(page) {
    const url = page.url();
    const title = await page.title().catch(() => "");

    const blockingIndicators = [
      url.includes("/login"),
      url.includes("/captcha"),
      url.includes("/blocked"),
      title.toLowerCase().includes("blocked"),
      title.toLowerCase().includes("captcha"),
    ];

    if (blockingIndicators.some((indicator) => indicator)) {
      throw new Error("Access blocked or verification required");
    }
  }

  async extractVideoData(page, limit) {
    const extractionStrategies = [
      this.extractWithMainSelectors.bind(this),
      this.extractWithFallbackSelectors.bind(this),
    ];

    for (const strategy of extractionStrategies) {
      try {
        const results = await strategy(page, limit);
        if (results && results.length > 0) {
          return results.slice(0, limit);
        }
      } catch (error) {
        console.warn("Extraction strategy failed:", error.message);
        continue;
      }
    }
    return [];
  }

  async extractWithMainSelectors(page, limit) {
    const rawResults = await page.evaluate((maxResults) => {
      function extractUsernameFromUrl(url) {
        if (!url) return "Unknown user";

        try {
          const match = url.match(/@([^\/]+)/);
          if (match && match[1]) {
            return match[1];
          }
          return "Unknown user";
        } catch (error) {
          return "Unknown user";
        }
      }

      const selectors = [
        '[data-e2e="search-video-item"]',
        '[data-testid="video-item"]',
        ".video-feed-item",
        '[class*="DivItemContainer"]',
      ];

      let videoElements = [];
      for (const selector of selectors) {
        videoElements = Array.from(document.querySelectorAll(selector));
        if (videoElements.length > 0) break;
      }

      return videoElements
        .slice(0, maxResults)
        .map((element, index) => {
          try {
            const linkElement = element.querySelector('a[href*="/video/"]');
            const videoUrl = linkElement ? linkElement.href : "";

            const username = extractUsernameFromUrl(videoUrl);

            const captionElement = element.querySelector(
              '[data-testid="caption"], [class*="caption"]'
            );
            let caption = "";
            if (captionElement) {
              caption = captionElement.textContent?.trim() || "";
            } else {
              const textElements = element.querySelectorAll("*");
              for (const textEl of textElements) {
                const text = textEl.textContent?.trim() || "";
                if (
                  text.length > 10 &&
                  text.length < 300 &&
                  !text.startsWith("@")
                ) {
                  caption = text;
                  break;
                }
              }
            }

            return {
              username: username,
              caption: caption || "No caption available",
              postUrl: videoUrl,
            };
          } catch (error) {
            console.warn("Error extracting video data:", error);
            return null; // Return null for failed extractions
          }
        })
        .filter((item) => item !== null && item.postUrl); // Filter out null and invalid items
    }, limit);

    // เพิ่ม sentiment analysis สำหรับผลลัพธ์และกรองเฉพาะ negative sentiment
    const resultsWithSentiment = await Promise.all(
      rawResults.map(async (result) => {
        try {
          const sentiment = await analyzeSentiment(result.caption);
          return {
            ...result,
            analyzeSentiment: sentiment,
          };
        } catch (error) {
          console.warn(
            `Failed to analyze sentiment for caption: ${result.caption}`,
            error
          );
          // Return null if sentiment analysis fails
          return null;
        }
      })
    );

    // กรองเฉพาะผลลัพธ์ที่มี sentiment เป็น "ความคิดเห็นเชิงลบ"
    return resultsWithSentiment.filter(
      (result) =>
        result !== null &&
        result !== undefined &&
        result.postUrl &&
        result.username &&
        result.analyzeSentiment === "ความคิดเห็นเชิงลบ"
    );
  }

  async extractWithFallbackSelectors(page, limit) {
    const rawResults = await page.evaluate((maxResults) => {
      function extractUsernameFromUrl(url) {
        if (!url) return "Unknown user";
        try {
          const match = url.match(/@([^\/]+)/);
          if (match && match[1]) {
            return match[1];
          }
          return "Unknown user";
        } catch (error) {
          return "Unknown user";
        }
      }

      const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));

      return links
        .slice(0, maxResults)
        .map((link, index) => {
          try {
            const container =
              link.closest("div, article, section") || link.parentElement;
            const text = container ? container.textContent?.trim() || "" : "";
            const username = extractUsernameFromUrl(link.href);
            return {
              username: username,
              caption:
                text.length > 10
                  ? text.substring(0, 200)
                  : "No caption available",
              postUrl: link.href,
            };
          } catch (error) {
            console.warn("Error in fallback extraction:", error);
            return null;
          }
        })
        .filter((item) => item !== null && item.postUrl); // Filter out null and invalid items
    }, limit);

    // เพิ่ม sentiment analysis สำหรับผลลัพธ์และกรองเฉพาะ negative sentiment
    const resultsWithSentiment = await Promise.all(
      rawResults.map(async (result) => {
        try {
          const sentiment = await analyzeSentiment(result.caption);
          return {
            ...result,
            analyzeSentiment: sentiment,
          };
        } catch (error) {
          console.warn(
            `Failed to analyze sentiment for caption: ${result.caption}`,
            error
          );
          // Return null if sentiment analysis fails
          return null;
        }
      })
    );

    // กรองเฉพาะผลลัพธ์ที่มี sentiment เป็น "ความคิดเห็นเชิงลบ"
    return resultsWithSentiment.filter(
      (result) =>
        result !== null &&
        result !== undefined &&
        result.postUrl &&
        result.username &&
        result.analyzeSentiment === "ความคิดเห็นเชิงลบ"
    );
  }
}

async function handleSearch(req, res) {
  const keyword = req.query.q?.trim();
  const requestedLimit = parseInt(req.query.limit);
  if (!keyword) {
    return res.status(400).json({
      success: false,
      error: "Missing query parameter",
      message: 'Please provide a search keyword using the "q" parameter',
    });
  }

  const scraper = new TikTokScraper();

  try {
    let lastError;
    let results = [];

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        results = await scraper.scrapeKeyword(keyword, requestedLimit);

        // Final filter to ensure only negative sentiment results
        const negativeResults = results.filter(
          (result) =>
            result !== null &&
            result !== undefined &&
            result.postUrl &&
            result.username &&
            result.analyzeSentiment === "ความคิดเห็นเชิงลบ"
        );

        const response = {
          keyword,
          total: negativeResults.length,
          results: negativeResults,
        };

        return res.json(response);
      } catch (error) {
        lastError = error;
        if (attempt < CONFIG.MAX_RETRIES) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000);
          await sleep(backoffTime);
        }
      }
    }

    throw lastError || new Error("All retry attempts failed");
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
}

module.exports = {
  handleSearch,
};
