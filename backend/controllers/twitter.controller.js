const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

// ฟังก์ชันสำหรับหลบการตรวจจับ bot
async function addStealthScripts(page) {
  await page.addInitScript(() => {
    // ซ่อน webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // เพิ่ม plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // เพิ่ม languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // ซ่อน automation
    delete navigator.__proto__.webdriver;
  });
}

const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";
let cachedStorageState = null;

async function loginAndCacheSession() {

  const browser = await chromium.launch({
    headless: false,           // ซ่อนหน้าต่าง Browser
    channel: "chrome",        // ซ่อน CMD ดำๆ (โดยใช้ Chrome ตัวเต็มแทน)
    args: ["--disable-gpu"],   // ลดภาระและป้องกันหน้าต่าง GPU process เด้งแว้บๆ
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/New_York",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // เพิ่ม stealth scripts
  await addStealthScripts(page);

  await page.goto("https://x.com/i/flow/login", {
    waitUntil: "domcontentloaded",
  });

  try {
    // รอให้ URL เปลี่ยนเป็น home หรือ URL ที่มี x.com โดยไม่มี /login
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        return (
          url.includes("x.com/home") ||
          (url.includes("x.com") && !url.includes("/login"))
        );
      },
      { timeout: 300000 } // 5 นาที
    );

    // รอเพิ่มอีกนิดให้แน่ใจว่า login สำเร็จ
    await page.waitForTimeout(3000);

    // ตรวจสอบว่า login สำเร็จจริงๆ โดยดูว่ามี element ของ home page หรือไม่
    const isLoggedIn = await page
      .waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', {
        timeout: 10000,
      })
      .then(() => true)
      .catch(() => false);

    if (!isLoggedIn) {
      throw new Error("ไม่พบ element ที่แสดงว่า login สำเร็จ");
    }

    // บันทึก session
    const storage = await context.storageState();
    fs.mkdirSync("./sessions", { recursive: true });
    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));

    console.log("\nLogin สำเร็จ! Session ถูกบันทึกแล้ว");
    console.log(`ฟล์: ${STORAGE_STATE_PATH}\n`);
  } catch (err) {
    console.error("\n Login ล้มเหลว:", err.message);
    console.error("กรุณาลองใหม่อีกครั้ง\n");
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
  const limit = Math.max(1, Number.parseInt(limitRaw ?? "10", 10) || 10);

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

  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--disable-gpu"],
    });

    context = await browser.newContext({
      storageState: cachedStorageState,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
      colorScheme: "light",
    });

    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(90000);

    // ลด resource หนักๆ เพื่อให้โหลดไวและลดโอกาส timeout
    await context.route("**/*", async (route) => {
      const req = route.request();
      const type = req.resourceType();
      if (["image", "media", "font"].includes(type)) return route.abort();
      return route.continue();
    });

    const page = await context.newPage();

    // เพิ่ม stealth scripts
    await addStealthScripts(page);

    const searchUrl = `https://x.com/search?q=${encodeURIComponent(
      keyword
    )}&src=typed_query&f=live`;

    // "networkidle" มักไม่เกิดบน x.com → ใช้ domcontentloaded แล้วรอ selector แทน
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    // ถ้า session หมดอายุ มักถูกเด้งไปหน้า login
    if (page.url().includes("/i/flow/login")) {
      cachedStorageState = null;
      throw new Error("Twitter session expired. Please login again.");
    }

    try {
      await page.waitForSelector('article [data-testid="tweetText"]', {
        timeout: 25000,
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

    return results;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ฟังก์ชั่นสำหรับจัดการค้นหาหลาย keyword
async function searchMultipleKeywords(keywords, limit) {
  const allResults = [];
  let totalProcessed = 0;

  console.log(`เริ่มค้นหา ${keywords.length} keywords: ${keywords.join(", ")}`);

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    console.log(
      `\n=== กำลังค้นหา keyword ที่ ${i + 1}/${keywords.length
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
        `เสร็จสิ้น keyword: "${keyword}" (${results.length} รายการ)`
      );

      // หน่วงเวลาระหว่างการค้นหา keyword เพื่อหลีกเลี่ยงการถูกบล็อค
      if (i < keywords.length - 1) {
        console.log("รอ 10 วินาทีก่อนค้นหา keyword ต่อไป...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (error) {
      console.error(`เกิดข้อผิดพลาดกับ keyword: "${keyword}"`, error);

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
