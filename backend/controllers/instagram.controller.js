const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");
const STORAGE_STATE_PATH = "./sessions/storageStateInstagram.json";

let cachedStorageState = null;

async function loginAndCacheSession() {
  console.log("เปิด browser เพื่อ login Instagram...");
  const browser = await chromium.launch({
    headless: true,
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

  const allResults = [];

  // Handle multiple keywords
  const keywords = keyword.split(",").map((k) => k.trim());

  for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
    const currentKeyword = keywords[keywordIndex];

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
        currentKeyword.replace("#", "")
      )}/`;
      await page.goto(searchUrl, { waitUntil: "load" });

      // Scroll to load more posts
      for (let i = 0; i < 3; i++) {
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await page.waitForTimeout(2000);
      }

      const postSelector = 'a[href^="/p/"]';
      try {
        await page.waitForSelector(postSelector, { timeout: 20000 });
      } catch (err) {
        console.log(
          `ไม่สามารถหาโพสต์บนหน้า Instagram ได้สำหรับ keyword: ${currentKeyword}`
        );
        continue;
      }

      const postElements = await page.$$(postSelector);
      console.log(
        `เจอโพสต์ทั้งหมด: ${postElements.length} สำหรับ keyword: ${currentKeyword}`
      );

      // Process each post
      const postsToProcess = postElements.slice(0, limit);
      const postTasks = [];

      for (const post of postsToProcess) {
        const postPath = await post.getAttribute("href");
        if (!postPath) continue;

        const postUrl = "https://www.instagram.com" + postPath;

        const postTask = (async () => {
          try {
            const postPage = await context.newPage();
            await postPage.goto(postUrl, { waitUntil: "load", timeout: 30000 });
            await postPage.waitForTimeout(2000);

            // Get username
            let username = "unknown";
            try {
              username = await postPage.$eval(
                'header a[href^="/"][role="link"] span',
                (el) => el.innerText.trim()
              );
            } catch (e) {
              console.warn("หา username ไม่เจอ:", e.message);
            }

            // Get caption
            let caption = "ไม่มี caption";
            try {
              caption = await postPage.$eval(
                "ul li div > div > div > span",
                (el) => {
                  let text = el.innerText || "";
                  text = text.replace(/#[\w\u0E00-\u0E7F]+/g, "").trim();
                  if (text.length > 200) {
                    text = text.substring(0, 200) + "...";
                  }
                  return text;
                }
              );
            } catch (e) {
              console.warn("หา caption ไม่เจอ:", e.message);
            }

            console.log(
              `ดึงข้อมูลสำเร็จ: ${username} - ${caption.substring(0, 50)}...`
            );
            const sentimentResult = await analyzeSentiment(caption);

            await postPage.close();
            if (sentimentResult === "ความคิดเห็นเชิงลบ") {
              return {
                username: username || "unknown",
                caption: caption || "ไม่มี caption",
                postUrl,
                analyzeSentiment: sentimentResult,
              };
            }
          } catch (err) {
            console.log(`โหลดโพสต์ล้มเหลว: ${postUrl}`);
            console.log("สาเหตุ:", err.message);
            return null;
          }
        })();

        postTasks.push(postTask);
      }

      // Wait for all post tasks to complete
      console.log(
        `กำลังดึงข้อมูลจาก Instagram สำหรับ keyword: ${currentKeyword}...`
      );
      const postResults = await Promise.allSettled(postTasks);

      for (const result of postResults) {
        if (result.status === "fulfilled" && result.value) {
          allResults.push(result.value);
        }
      }

      await page.close();
    } catch (err) {
      console.error(`Error processing keyword ${currentKeyword}:`, err);
    }
  }

  await context.close();
  await browser.close();

  return allResults.slice(0, limit);
}

// Express route handler
async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const results = await searchInstagram(q, parseInt(limit) || 10);

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
  searchInstagram,
  handleSearch,
};
