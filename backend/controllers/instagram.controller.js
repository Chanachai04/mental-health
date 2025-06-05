const fs = require("fs");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateIG.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login Instagram...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/");
  console.log("กรุณาล็อกอินใน browser นี้...");

  // รอจนกว่าจะเข้าสู่หน้า Home (feed) เพื่อยืนยันว่าล็อกอินสำเร็จ
  await page.waitForURL("https://www.instagram.com/", { timeout: 0 });

  cachedStorageState = await context.storageState();
  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchInstagram(keyword, limit = 20) {
  const browser = await chromium.launch({ headless: false });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateIG.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  // ไปที่หน้า hashtag search เช่น https://www.instagram.com/explore/tags/keyword/
  const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
    keyword
  )}/`;
  await page.goto(searchUrl);

  await page.waitForSelector("article > div img", { timeout: 10000 });

  const results = [];
  let postHandles = [];

  // เลื่อนโหลดโพสต์เรื่อยๆ จนกว่าจะได้ limit ที่ต้องการ
  while (results.length < limit) {
    postHandles = await page.$$("article div div div div a");

    for (const postHandle of postHandles) {
      if (results.length >= limit) break;

      // ดึง url ของโพสต์
      const postUrl = await postHandle.getAttribute("href");

      // ดึงชื่อเจ้าของโพสต์จาก url เช่น /username/p/xxxxxx/
      const username = postUrl.split("/")[1];

      // กดเข้าโพสต์เพื่อดึง caption หรือรายละเอียดอื่น ๆ
      const postPage = await context.newPage();
      await postPage.goto(`https://www.instagram.com${postUrl}`);

      await postPage
        .waitForSelector("article header a", { timeout: 5000 })
        .catch(() => {});

      // ดึง caption ด้วย selector ที่เสถียรกว่า
      const caption = await postPage
        .$eval("div.C4VMK > span", (el) => el.innerText)
        .catch(() => "");

      // เพิ่มข้อมูลลง results
      results.push({
        id: results.length + 1,
        username,
        postUrl: `https://www.instagram.com${postUrl}`,
        caption,
      });

      await postPage.close();
    }

    // เลื่อนหน้าลงไปโหลดโพสต์เพิ่ม
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000);

    // ถ้าโหลดไม่ขึ้นเพิ่มให้ break
    const newPostHandles = await page.$$("article div div div div a");
    if (newPostHandles.length <= postHandles.length) break;
  }

  await context.close();
  await browser.close();
  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = limit ? parseInt(limit) : 20;
    const results = await searchInstagram(q, numLimit);
    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
