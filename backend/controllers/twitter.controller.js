const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
// const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateTwitter.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login Twitter...");
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("https://x.com/login", { waitUntil: "networkidle" });
    console.log("กรุณาล็อกอินใน browser นี้...");
    console.log("รอจนกว่าจะเห็นหน้า Home feed...");

    // รอหลายๆ selector เพื่อให้แน่ใจว่า login สำเร็จ
    await Promise.race([
      // รอ home feed
      page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 0 }),
      // รอ navigation bar
      page.waitForSelector('nav[aria-label="Primary"]', { timeout: 0 }),
      // รอ URL เปลี่ยน
      page.waitForURL(/https:\/\/(x|twitter)\.com\/(home|$)/, { timeout: 0 }),
      // รอ timeline
      page.waitForSelector('[data-testid="tweet"]', { timeout: 0 }),
      // รอ compose button
      page.waitForSelector('[data-testid="SideNav_NewTweet_Button"]', {
        timeout: 0,
      }),
    ]);

    console.log("ตรวจพบหน้า home แล้ว รอสักครู่...");
    // รอเพิ่มเติมเพื่อให้แน่ใจว่าหน้าโหลดเสร็จ
    await page.waitForTimeout(5000);

    // ตรวจสอบว่า login สำเร็จจริงๆ
    const isLoggedIn = await page.evaluate(() => {
      // ตรวจสอบว่ามี element ที่แสดงว่า login แล้ว
      const indicators = [
        document.querySelector(
          '[data-testid="SideNav_AccountSwitcher_Button"]'
        ),
        document.querySelector('[data-testid="AppTabBar_Profile_Link"]'),
        document.querySelector('[aria-label="Profile"]'),
        document.querySelector('[data-testid="SideNav_NewTweet_Button"]'),
        document.querySelector('[data-testid="primaryColumn"]'),
      ];

      return indicators.some((el) => el !== null);
    });

    if (!isLoggedIn) {
      throw new Error(
        "ไม่สามารถยืนยันการ login ได้ - ไม่พบ element ที่แสดงว่า login แล้ว"
      );
    }

    console.log("ตรวจพบการ login สำเร็จ กำลังบันทึก session...");

    // บันทึก storage state
    cachedStorageState = await context.storageState();

    // สร้างโฟลเดอร์ถ้ายังไม่มี
    const sessionDir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log(`สร้างโฟลเดอร์: ${sessionDir}`);
    }

    // บันทึกลงไฟล์
    fs.writeFileSync(
      STORAGE_STATE_PATH,
      JSON.stringify(cachedStorageState, null, 2)
    );

    console.log("บันทึก session ลงไฟล์สำเร็จ");
    console.log(`ฟล์: ${STORAGE_STATE_PATH}`);

    // ตรวจสอบว่าไฟล์ถูกสร้างจริง
    if (fs.existsSync(STORAGE_STATE_PATH)) {
      const fileSize = fs.statSync(STORAGE_STATE_PATH).size;
      console.log(`ขนาดไฟล์: ${fileSize} bytes`);

      // ตรวจสอบว่าไฟล์มีข้อมูล cookies
      if (cachedStorageState.cookies && cachedStorageState.cookies.length > 0) {
        console.log(`จำนวน cookies: ${cachedStorageState.cookies.length}`);
      } else {
        console.log("ไม่พบ cookies ใน session");
      }
    } else {
      throw new Error("ไม่สามารถสร้างไฟล์ session ได้");
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการ login:", error.message);
    throw error;
  } finally {
    await context.close();
  }
}

// ฟังก์ชันตรวจสอบ session
async function validateSession(page) {
  try {
    await page.goto("https://x.com/home", { waitUntil: "networkidle" });

    // รอ element ที่แสดงว่า login แล้ว
    await page.waitForSelector('[data-testid="primaryColumn"]', {
      timeout: 5000,
    });

    // ตรวจสอบว่า session หมดอายุหรือไม่
    const needRelogin = await page.evaluate(() => {
      return (
        window.location.pathname.includes("/login") ||
        window.location.pathname.includes("/i/flow/login") ||
        window.location.pathname.includes("/i/flow/signup")
      );
    });

    return !needRelogin;
  } catch (error) {
    console.log("Session validation failed:", error.message);
    return false;
  }
}

// ปรับปรุงฟังก์ชัน searchTwitter ให้ handle session ดีขึ้น
async function searchTwitter(keyword, limit = 10, sinceDate, untilDate) {
  const browser = await chromium.launch({
    headless: process.env.NODE_ENV === "production",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // โหลด session จากไฟล์
    if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
      try {
        const sessionData = fs.readFileSync(STORAGE_STATE_PATH, "utf-8");
        cachedStorageState = JSON.parse(sessionData);
        console.log("โหลด session จากไฟล์สำเร็จ");
      } catch (error) {
        console.log("ไฟล์ session เสียหาย กำลังลบและสร้างใหม่...");
        if (fs.existsSync(STORAGE_STATE_PATH)) {
          fs.unlinkSync(STORAGE_STATE_PATH);
        }
        cachedStorageState = null;
      }
    }

    // ถ้าไม่มี session ให้ login ใหม่
    if (!cachedStorageState) {
      console.log("🔑 ไม่พบ session ที่ใช้ได้ กำลัง login ใหม่...");
      await loginAndCacheSession(browser);
    }

    // สร้าง context ด้วย session
    const context = await browser.newContext({
      storageState: cachedStorageState,
    });
    const page = await context.newPage();

    // ตรวจสอบว่า session ยังใช้ได้อยู่
    const isSessionValid = await validateSession(page);

    if (!isSessionValid) {
      console.log("🔄 Session หมดอายุ กำลัง login ใหม่...");
      await context.close();
      cachedStorageState = null;

      // ลบไฟล์ session เก่า
      if (fs.existsSync(STORAGE_STATE_PATH)) {
        fs.unlinkSync(STORAGE_STATE_PATH);
      }

      await loginAndCacheSession(browser);

      // สร้าง context ใหม่ด้วย session ใหม่
      const newContext = await browser.newContext({
        storageState: cachedStorageState,
      });
      const newPage = await newContext.newPage();

      // ดำเนินการค้นหาต่อ...
      const results = await performSearch(
        newPage,
        keyword,
        limit,
        sinceDate,
        untilDate
      );
      await newContext.close();
      return results;
    }

    // ถ้า session ใช้ได้ ให้ดำเนินการค้นหา
    const results = await performSearch(
      page,
      keyword,
      limit,
      sinceDate,
      untilDate
    );
    await context.close();
    return results;
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการค้นหา:", error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// แยกฟังก์ชันค้นหาออกมา
async function performSearch(page, keyword, limit, sinceDate, untilDate) {
  console.log(`กำลังค้นหา: ${keyword}`);

  let query = keyword;
  if (sinceDate) query += ` since:${sinceDate}`;
  if (untilDate) query += ` until:${untilDate}`;

  const searchUrl = `https://x.com/search?q=${encodeURIComponent(
    query
  )}&f=live`;
  await page.goto(searchUrl, { waitUntil: "networkidle" });

  try {
    // รอให้ tweet โหลด
    await page.waitForSelector('article div[data-testid="tweetText"]', {
      timeout: 15000,
    });
  } catch (error) {
    console.log("ไม่พบ tweet หรือ selector เปลี่ยน");
    // ลองรอ selector อื่น
    await page.waitForSelector("article", { timeout: 10000 });
  }

  const results = [];
  let lastHeight = 0;
  let idCounter = 1;
  let scrollAttempts = 0;
  const maxScrollAttempts = 10;

  console.log(`เป้าหมาย: ${limit} posts`);

  while (results.length < limit && scrollAttempts < maxScrollAttempts) {
    const tweets = await page.$$("article");
    console.log(`พบ ${tweets.length} articles ในหน้า`);

    for (const tweet of tweets) {
      if (results.length >= limit) break;

      try {
        const username = await tweet
          .$eval('div[dir="ltr"] > span', (el) => el.innerText)
          .catch(() =>
            tweet
              .$eval('[data-testid="User-Name"] span', (el) => el.innerText)
              .catch(() => "unknown")
          );

        const caption = await tweet
          .$eval('div[data-testid="tweetText"]', (el) => el.innerText)
          .catch(() => "unknown");

        const postUrl = await tweet
          .$eval('a[role="link"][href*="/status/"]', (a) => a.href)
          .catch(() => "unknown");

        if (caption !== "unknown" && postUrl !== "unknown") {
          if (!results.some((r) => r.postUrl === postUrl)) {
            results.push({
              id: idCounter++,
              username,
              caption,
              postUrl,
            });
            console.log(`เพิ่ม tweet ${results.length}/${limit}`);
          }
        }
      } catch (error) {
        console.log("ข้าม tweet ที่ parse ไม่ได้:", error.message);
      }
    }

    // Scroll down
    lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(3000); // รอให้โหลด

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) {
      scrollAttempts++;
      console.log(`ไม่มีเนื้อหาใหม่ (${scrollAttempts}/${maxScrollAttempts})`);
    } else {
      scrollAttempts = 0; // reset counter
    }
  }

  console.log(`เสร็จสิ้น: ได้ ${results.length} tweets`);
  return results.slice(0, limit);
}

// ฟังก์ชันสำหรับ API handler
async function handleSearch(req, res) {
  const { q, limit, since, until } = req.query;

  if (!q) {
    return res.status(400).json({
      error: "Missing ?q=keyword",
      usage: "GET /search?q=keyword&limit=10&since=2024-01-01&until=2024-12-31",
    });
  }

  try {
    console.log(`เริ่มค้นหา: ${q}`);
    const numLimit = limit ? parseInt(limit) : 10;
    const results = await searchTwitter(q, numLimit, since, until);

    res.json({
      success: true,
      query: q,
      limit: numLimit,
      found: results.length,
      results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      error: "Search failed",
      message: err.message,
    });
  }
}

// ฟังก์ชันลบ session (สำหรับ debug)
function clearSession() {
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    fs.unlinkSync(STORAGE_STATE_PATH);
    console.log("ลบ session file แล้ว");
  }
  cachedStorageState = null;
  console.log("ล้าง cached session แล้ว");
}

module.exports = {
  handleSearch,
  searchTwitter,
  clearSession,
  loginAndCacheSession,
};
