const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("Launching browser for manual Twitter login...");

  const browser = await chromium.launch({
    headless: false, // ให้เห็น login page
    slowMo: 100,
    args: [
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

  const page = await context.newPage();

  await page.goto("https://x.com/i/flow/login");

  try {
    // รอจน login สำเร็จ (หน้า home) ภายใน 2 นาที
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

async function simulateHumanBehavior(page) {
  // ขยับเมาส์สุ่ม
  await page.mouse.move(Math.random() * 1920, Math.random() * 1080);
  await page.waitForTimeout(500 + Math.random() * 1500);

  // Scroll แบบสุ่ม
  await page.evaluate(() => {
    window.scrollBy(0, 100 + Math.random() * 300);
  });
  await page.waitForTimeout(500 + Math.random() * 1500);
}

async function searchTwitter(keyword, limitRaw) {
  const limit = parseInt(limitRaw);

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

  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
    args: [
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
    storageState: cachedStorageState,
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

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  const searchUrl = `https://x.com/search?q=${encodeURIComponent(
    keyword
  )}&src=typed_query&f=live`;
  await page.goto(searchUrl, {
    waitUntil: "networkidle",
    timeout: 50000,
  });

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
  const maxScrollAttempts = 20;
  let noContentCount = 0;

  while (results.length < limit && scrollAttempts < maxScrollAttempts) {
    await simulateHumanBehavior(page);

    const tweets = await page.$$("article");
    console.log(`รอบที่ ${scrollAttempts + 1} X: พบ ${tweets.length} โพสต์`);

    for (const tweet of tweets) {
      if (results.length >= limit) break;

      const caption = await tweet
        .$eval('div[data-testid="tweetText"]', (el) => el.innerText)
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

    const lastHeight = await page.evaluate(() => document.body.scrollHeight);

    // Scroll แบบมนุษย์มากขึ้น
    await page.mouse.move(Math.random() * 1920, Math.random() * 1080);
    await page.mouse.wheel(0, 2000);
    await page.keyboard.press("PageDown");

    await page.waitForTimeout(7000);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === lastHeight) {
      noContentCount++;
    } else {
      noContentCount = 0;
    }

    if (noContentCount > 10) {
      console.log("หมดเนื้อหาให้ scroll ของ X แล้ว ");
      break;
    }

    scrollAttempts++;
  }

  await context.close();
  await browser.close();

  return results;
}

// ฟังก์ชั่นสำหรับจัดการค้นหาหลาย keyword
async function searchMultipleKeywords(keywords, limit) {
  const allResults = [];
  let totalProcessed = 0;

  console.log(`เริ่มค้นหา ${keywords.length} keywords: ${keywords.join(", ")}`);

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    console.log(
      `\n=== กำลังค้นหา keyword ที่ ${i + 1}/${
        keywords.length
      }: "${keyword}" ===`
    );

    try {
      const results = await searchTwitter(keyword, limit);

      allResults.push({
        keyword: keyword,
        total: results.length,
        results: results,
      });

      totalProcessed++;
      console.log(
        `✅ เสร็จสิ้น keyword: "${keyword}" (${results.length} รายการ)`
      );

      // หน่วงเวลาระหว่างการค้นหา keyword เพื่อหลีกเลี่ยงการถูกบล็อค
      if (i < keywords.length - 1) {
        console.log("รอ 10 วินาทีก่อนค้นหา keyword ต่อไป...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (error) {
      console.error(`❌ เกิดข้อผิดพลาดกับ keyword: "${keyword}"`, error);

      // เพิ่มข้อมูลว่าเกิดข้อผิดพลาด
      allResults.push({
        keyword: keyword,
        total: 0,
        results: [],
        error: error.message,
      });
    }
  }

  console.log(`\n=== สรุปผล ===`);
  console.log(`ประมวลผล ${totalProcessed}/${keywords.length} keywords สำเร็จ`);

  return allResults;
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q=keyword" });
  }

  try {
    // ตรวจสอบว่า keyword มี comma หรือไม่
    const hasComma = q.includes(",");

    if (!hasComma) {
      // กรณีมีแค่ keyword เดียว - ใช้ฟังก์ชั่นเดิม (รูปแบบเดิมสำหรับ Frontend)
      console.log(`ค้นหา keyword เดียว: "${q}"`);
      const results = await searchTwitter(q, limit);

      res.json({
        keyword: q,
        total: results.length,
        results: results, // รูปแบบเดิมที่ Frontend คาดหวัง
      });
    } else {
      // กรณีมีหลาย keyword - รวมผลลัพธ์ทั้งหมดเป็น array เดียวสำหรับ Frontend
      const keywords = q
        .split(",")
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);

      if (keywords.length === 0) {
        return res
          .status(400)
          .json({ error: "No valid keywords found after splitting" });
      }

      console.log(`ค้นหาหลาย keywords: ${keywords.length} คำ`);
      const allResults = await searchMultipleKeywords(keywords, limit);

      // รวมผลลัพธ์ทั้งหมดเป็น array เดียวสำหรับ Frontend
      const combinedResults = [];
      allResults.forEach((keywordResult) => {
        if (keywordResult.results && keywordResult.results.length > 0) {
          // เพิ่ม keyword ที่ใช้ค้นหาใน object แต่ละรายการ
          const resultsWithKeyword = keywordResult.results.map((result) => ({
            ...result,
            searchKeyword: keywordResult.keyword, // เพิ่มข้อมูลว่าค้นหาด้วย keyword อะไร
          }));
          combinedResults.push(...resultsWithKeyword);
        }
      });

      res.json({
        keyword: keywords.join(", "), // แสดงรวม keywords ทั้งหมด
        total: combinedResults.length,
        results: combinedResults, // รูปแบบเดิมที่ Frontend คาดหวัง
      });
    }
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
