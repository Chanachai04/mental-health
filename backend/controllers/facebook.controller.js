const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateFacebook.json";

let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("เปิด browser เพื่อ login Facebook...");
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
    args: ['--headless=new'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.facebook.com/login");
  console.log("กรุณาล็อกอินใน browser นี้...");

  await page.waitForURL("https://www.facebook.com/", { timeout: 0 });
  const storage = await context.storageState();
  fs.mkdirSync("./sessions", { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchFacebook(keyword, limitRaw) {
  const limit = parseInt(limitRaw);
  const browser = await chromium.launch({ 
    headless: true,
    slowMo: 100,
    args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox']
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateFacebook.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession();
    throw new Error("ยังไม่ได้ล็อกอิน Facebook");
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });

  const keywords = keyword.split(",").map((k) => k.trim());
  const seenUrls = new Set();
  const postResults = [];
  let keywordIndex = 0;

  while (postResults.length < limit) {
    const currentKeyword = keywords[keywordIndex];

    const page = await context.newPage();
    const filterBase64 = btoa(
      JSON.stringify({
        "recent_posts:0": JSON.stringify({
          name: "recent_posts",
          args: "",
        }),
      })
    );
    const searchUrl = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
      currentKeyword
    )}&filters=${encodeURIComponent(filterBase64)}`;

    await page.goto(searchUrl, { waitUntil: "load" });

    try {
      await page.waitForSelector('[role="article"]', { timeout: 10000 });
    } catch (err) {
      console.warn(`ไม่เจอโพสต์สำหรับ keyword "${currentKeyword}"`);
      await page.close();
      keywordIndex = (keywordIndex + 1) % keywords.length;
      continue;
    }

    let scrolls = 0;
    let scrollCount = 0;
    while (postResults.length < limit) {
      const posts = await page.$$('[role="article"]');
      scrollCount++;
      console.log(`รอบที่ ${scrollCount} Facebook : พบ ${posts.length} โพสต์`);
      for (const post of posts) {
        if (postResults.length >= limit) break;

        let username = "unknown";
        let caption = "";
        let postUrl = "";

        try {
          let rawUsername =
            (await post
              .$eval("strong a", (el) => el.innerText)
              .catch(() => null)) ||
            (await post
              .$eval("h3 a, h3 span", (el) => el.innerText)
              .catch(() => null)) ||
            (await post
              .$eval('div[dir="auto"] span', (el) => el.innerText)
              .catch(() => "unknown"));
          let rawCaption = await post
            .$eval('div[dir="auto"]', (el) => el.innerText)
            .catch(() => "unknown");

          username = rawUsername
            .replace(/\n/g, " ")
            .replace(/·.*$/, "")
            .replace(/\s+/g, " ")
            .trim();

          caption = rawCaption
            .replace(/…\s*ดูเพิ่มเติม/g, "")
            .replace(/\s*ดูเพิ่มเติม/g, "")
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          postUrl = await post
            .$eval('a[tabindex="0"]', (a) => a.href)
            .catch(() => null);
        } catch (e) {
          continue;
        }

        if (caption !== "unknown" && postUrl && !seenUrls.has(postUrl)) {
          seenUrls.add(postUrl);

          try {
            const sentimentResult = await analyzeSentiment(caption);
            if (sentimentResult === "ความคิดเห็นเชิงลบ") {
              postResults.push({
                username,
                caption,
                postUrl,
                analyzeSentiment: sentimentResult,
              });
              console.log(
                `เก็บโพสต์ Facebook เชิงลบได้ ${postResults.length}/${limit}`
              );
            }
          } catch (e) {
            console.warn("sentiment error:", e);
          }
        }
      }

      const lastHeight = await page.evaluate("document.body.scrollHeight");
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(5000);
      const newHeight = await page.evaluate("document.body.scrollHeight");

      if (newHeight === lastHeight) {
        console.log("หมดเนื้อหาให้ scroll ของ Tiktok แล้ว");
        break;
      }

      scrolls++;
    }

    await page.close();

    keywordIndex = (keywordIndex + 1) % keywords.length;

    // หยุดถ้าไม่มี keyword ใหม่ให้ลองแล้ว
    if (keywordIndex === 0 && postResults.length < limit) {
      break;
    }
  }

  await context.close();
  await browser.close();

  return postResults.slice(0, limit);
}

// ✅ Express route handler
async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const results = await searchFacebook(q, parseInt(limit));

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

// ✅ Export both
module.exports = {
  handleSearch,
};
