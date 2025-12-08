const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

async function createOptimizedBrowser() {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 200, // เพิ่มความช้าให้เหมือน human
    args: [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-ipc-flooding-protection",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
    extraHTTPHeaders: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  return { browser, context };
}

async function waitForTikTokContentHeadless(page, maxWaitTime = 45000) {
  const startTime = Date.now();
  let lastVideoCount = 0;
  let stableCount = 0;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      await page.waitForLoadState("domcontentloaded");

      const videoCount = await page.evaluate(() => {
        const videos = document.querySelectorAll('a[href*="/video/"]');
        return videos.length;
      });

      if (videoCount > 0) {
        if (videoCount === lastVideoCount) {
          stableCount++;
        } else {
          stableCount = 0;
          lastVideoCount = videoCount;
        }

        if (stableCount >= 3) {
          console.log(`พบ ${videoCount} วิดีโอ (เสถียรแล้ว)`);
          return true;
        }
      }

      await page.waitForTimeout(3000);
    } catch {
      console.log("ยังไม่พบ content, รอต่อ...");
      await page.waitForTimeout(3000);
    }
  }

  return false;
}

async function simulateHumanBehavior(page) {
  await page.mouse.move(Math.random() * 1920, Math.random() * 1080);
  await page.waitForTimeout(1000 + Math.random() * 2000);
  await page.evaluate(() => {
    window.scrollBy(0, 100 + Math.random() * 200);
  });
  await page.waitForTimeout(500 + Math.random() * 1000);
}

// ฟังก์ชัน scroll แบบ smooth ทีละ viewport (เต็มหน้าจอ) เพื่อกระตุ้นโหลด content ใหม่
async function smoothScroll(page, totalHeight) {
  let scrolled = 0;
  while (scrolled < totalHeight) {
    const step = 100 + Math.random() * 200;
    await page.evaluate((step) => window.scrollBy(0, step), step);
    scrolled += step;
    await page.waitForTimeout(500 + Math.random() * 1000);
  }
}

async function searchTikTokSingleKeyword(
  keyword,
  limitPerKeyword,
  browser,
  context
) {
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(
    keyword
  )}`;

  try {
    console.log(`กำลังค้นหา TikTok สำหรับคำ: "${keyword}"`);

    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await simulateHumanBehavior(page);

    const contentLoaded = await waitForTikTokContentHeadless(page);

    if (!contentLoaded) {
      console.warn(`ไม่พบ TikTok videos สำหรับคำ: "${keyword}"`);
      await page.close();
      return [];
    }

    await page.waitForTimeout(5000);
  } catch (err) {
    console.error(`Error loading TikTok page สำหรับคำ "${keyword}":`, err);
    await page.close();
    return [];
  }

  const results = [];
  const seenUrls = new Set();
  let scrollAttempts = 0;
  const maxScrollAttempts = 20;
  let noNewContentCount = 0;

  while (
    results.length < limitPerKeyword &&
    scrollAttempts < maxScrollAttempts
  ) {
    await simulateHumanBehavior(page);

    const videoContainers = await page.$$('a[href*="/video/"]');

    console.log(
      `รอบที่ ${scrollAttempts + 1} TikTok (${keyword}): พบ ${
        videoContainers.length
      } วิดีโอ`
    );

    let newItemsFound = 0;

    for (const container of videoContainers) {
      if (results.length >= limitPerKeyword) break;

      let username = "unknown";
      let caption = "";
      let postUrl = "";

      try {
        postUrl = await container.getAttribute("href");
        if (postUrl && !postUrl.startsWith("https://")) {
          postUrl = "https://www.tiktok.com" + postUrl;
        }
        if (!postUrl || seenUrls.has(postUrl)) continue;

        seenUrls.add(postUrl);
        newItemsFound++;

        await page.waitForTimeout(100);

        const parentContainer = await container.evaluateHandle((el) => {
          let parent = el.parentElement;
          let attempts = 0;
          while (parent && attempts < 10) {
            if (
              parent.querySelector('[data-e2e="search-card-user-unique-id"]') ||
              parent.querySelector('[data-e2e="search-card-video-caption"]')
            ) {
              return parent;
            }
            parent = parent.parentElement;
            attempts++;
            if (parent === document.body) break;
          }
          return parent || el.parentElement;
        });

        if (parentContainer) {
          const usernameSelectors = [
            'p[data-e2e="search-card-user-unique-id"]',
            '[data-e2e="search-card-user-unique-id"]',
            'span[data-e2e="search-card-user-unique-id"]',
          ];

          for (const selector of usernameSelectors) {
            try {
              const usernameElement = await parentContainer.$(selector);
              if (usernameElement) {
                username = await usernameElement.innerText();
                break;
              }
            } catch {
              continue;
            }
          }

          const captionSelectors = [
            'div[data-e2e="search-card-video-caption"]',
            '[data-e2e="search-card-video-caption"]',
          ];

          for (const selector of captionSelectors) {
            try {
              const captionElement = await parentContainer.$(selector);
              if (captionElement) {
                let rawCaption = await captionElement.innerText();
                caption = rawCaption
                  .replace(/\n/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                break;
              }
            } catch {
              continue;
            }
          }
        }

        if (!caption) {
          try {
            const imgElement = await container.$("img[alt]");
            if (imgElement) {
              const altText = await imgElement.getAttribute("alt");
              if (altText && altText.length > 10) {
                caption = altText;
              }
            }
          } catch {}
        }
      } catch (e) {
        console.error("Error extracting data:", e);
        continue;
      }

      if (caption && postUrl) {
        try {
          const sentiment = await analyzeSentiment(caption);
          if (sentiment === "ความคิดเห็นเชิงลบ") {
            results.push({
              username,
              caption,
              postUrl,
              analyzeSentiment: sentiment,
              keyword: keyword, // เพิ่ม keyword ที่พบ
            });
            console.log(
              `เก็บโพสต์ TikTok เชิงลบได้ ${results.length}/${limitPerKeyword} สำหรับคำ "${keyword}"`
            );
          }
        } catch (sentimentError) {
          console.error("Error analyzing sentiment:", sentimentError);
        }
      }
    }

    if (newItemsFound === 0) {
      noNewContentCount++;
      if (noNewContentCount >= 2) {
        console.log(
          `ไม่มี content ใหม่ 2 รอบติดต่อกัน หยุดการค้นหาสำหรับคำ "${keyword}"`
        );
        break;
      }
    } else {
      noNewContentCount = 0;
    }

    try {
      const lastHeight = await page.evaluate("document.body.scrollHeight");

      // scroll แบบ smooth ทีละ viewport
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      await smoothScroll(page, viewportHeight || 1080);

      // fallback scroll ด้วย mouse wheel เผื่อโหลด content ไม่ครบ
      await page.mouse.wheel(0, 1000);

      await page.waitForTimeout(7000);

      const newHeight = await page.evaluate("document.body.scrollHeight");

      if (newHeight === lastHeight) {
        console.log(
          `หมดเนื้อหาให้ scroll ของ TikTok แล้วสำหรับคำ "${keyword}"`
        );
        break;
      }
    } catch (scrollError) {
      console.error("Error during scrolling:", scrollError);
      break;
    }

    scrollAttempts++;
  }

  await page.close();
  return results;
}

async function searchTikTok(keywordString, limitRaw) {
  const limitPerKeyword = parseInt(limitRaw);

  const keywords = keywordString
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k);

  if (keywords.length === 0) {
    throw new Error("No valid keywords provided");
  }

  console.log(`กำลังค้นหา TikTok สำหรับคำ: ${keywords.join(", ")}`);
  console.log(`limit ต่อ keyword: ${limitPerKeyword}`);

  const { browser, context } = await createOptimizedBrowser();
  const allResults = [];

  try {
    for (const keyword of keywords) {
      console.log(`\n=== เริ่มค้นหาคำ: "${keyword}" ===`);

      const keywordResults = await searchTikTokSingleKeyword(
        keyword,
        limitPerKeyword,
        browser,
        context
      );

      allResults.push(...keywordResults);

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const finalResults = allResults;

  console.log(`\n=== สรุปผลการค้นหา ===`);
  console.log(`คำที่ค้นหา: ${keywords.join(", ")}`);
  console.log(`จำนวนโพสต์เชิงลบที่พบ: ${finalResults.length} (รวมทุกคำ)`);

  return finalResults;
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q=keyword" });
  }

  try {
    console.log(`Searching TikTok for: "${q}" with limit: ${limit}`);
    const results = await searchTikTok(q, limit);

    // นับจำนวนต่อคำ
    const keywordCounts = {};
    results.forEach((result) => {
      const keyword = result.keyword;
      keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
    });

    res.json({
      keyword: q,
      keywordCounts,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("TikTok search error:", err);
    res.status(500).json({ error: err.message || "TikTok search failed" });
  }
}

module.exports = {
  handleSearch,
};
