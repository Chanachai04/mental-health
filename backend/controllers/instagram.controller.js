const fs = require("fs");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateInstagram.json";

let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("เปิด browser เพื่อ login Instagram...");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/?flo=true");
  console.log("กรุณาล็อกอินใน browser ที่เปิดขึ้นมา...");

  await page.waitForURL("https://www.instagram.com/", { timeout: 0 });
  const storage = await context.storageState();
  fs.mkdirSync("./sessions", { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchInstagram(keyword, limit) {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateInstagram.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
    keyword.replace("#", "")
  )}/`;
  await page.goto(searchUrl, { waitUntil: "load" });

  for (let i = 0; i < 3; i++) {
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);
  }

  const postSelector = 'a[href^="/p/"]';

  try {
    await page.waitForSelector(postSelector, { timeout: 20000 });
  } catch (err) {
    throw new Error("ไม่สามารถหาโพสต์บนหน้า Instagram ได้");
  }

  const postElements = await page.$$(postSelector);
  console.log(`เจอโพสต์ทั้งหมด: ${postElements.length}`);

  const postTasks = [];

  for (const post of postElements.slice(0, limit)) {
    const postPath = await post.getAttribute("href");
    if (!postPath) continue;

    const postUrl = "https://www.instagram.com" + postPath;

    const task = (async () => {
      let postPage;
      try {
        postPage = await context.newPage();
        await postPage.goto(postUrl, { waitUntil: "load", timeout: 30000 });
        await postPage.waitForTimeout(2000);

        let username = "unknown";
        try {
          username = await postPage.$eval(
            "span._ap3a._aaco._aacw._aacx._aad7._aade",
            (el) => el.innerText.trim()
          );
        } catch {}

        let caption = "ไม่มี caption";
        try {
          caption = await postPage.$eval(
            "span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx.x126k92a",
            (el) => {
              let text = el.innerText || "";
              text = text.replace(/#[\w\u0E00-\u0E7F]+/g, "").trim();
              if (text.length > 200) {
                text = text.substring(0, 200) + "...";
              }
              return text;
            }
          );
        } catch {}

        console.log(
          `ดึงข้อมูลสำเร็จ: ${username} - ${caption.substring(0, 50)}...`
        );

        return {
          username: username || "unknown",
          caption: caption || "ไม่มี caption",
          postUrl,
        };
      } catch (err) {
        console.log(`โหลดโพสต์ล้มเหลว: ${postUrl}`);
        console.log("สาเหตุ:", err.message);
        return null;
      } finally {
        if (postPage && !postPage.isClosed()) {
          await postPage.close();
        }
      }
    })();

    postTasks.push(task);
  }

  console.log("กำลังดึงข้อมูลจากInstagram...");
  const postResults = await Promise.allSettled(postTasks);
  const results = [];

  for (const r of postResults) {
    if (r.status === "fulfilled" && r.value) {
      results.push({ ...r.value });
    }
  }

  await context.close();
  await browser.close();

  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const results = await searchInstagram(q, limit);

    res.json({
      keyword: q,
      total: results.length,
      results: results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
