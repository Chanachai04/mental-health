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
    args: ['--headless=new']
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
    args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox']
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
  const seenUrls = new Set(); // ป้องกันโพสต์ซ้ำ
  const keywords = keyword.split(",").map((k) => k.trim());

  for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
    const currentKeyword = keywords[keywordIndex];
    const cleanKeyword = currentKeyword.replace(/^#/, "");

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
        cleanKeyword
      )}/`;
      await page.goto(searchUrl, { waitUntil: "load" });

      let scrollCount = 0;

      while (allResults.length < limit) {
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await page.waitForTimeout(2000);
        scrollCount++;

        const postElements = await page.$$('a[href^="/p/"]');
        console.log(
          `รอบที่ ${scrollCount} Instagram : พบ ${postElements.length} โพสต์ `
        );

        for (const post of postElements) {
          if (allResults.length >= limit) break;

          const postPath = await post.getAttribute("href");
          const postUrl = "https://www.instagram.com" + postPath;

          if (!postPath || seenUrls.has(postUrl)) continue;
          seenUrls.add(postUrl);

          try {
            const postPage = await context.newPage();
            await postPage.goto(postUrl, { waitUntil: "load", timeout: 30000 });
            await postPage.waitForTimeout(2000);

            // หา username
            let username = "unknown";
            const usernameSelectors = [
              'span._ap3a[dir="auto"]',
              'a[href^="/"][role="link"]:not([href="/"])',
              'header a[href^="/"][role="link"] span',
              'a[href^="/"][role="link"] span[dir="auto"]',
              'header span[dir="auto"]',
              'a[href^="/"][href$="/"]',
            ];

            for (const selector of usernameSelectors) {
              try {
                if (selector.includes("href")) {
                  username = await postPage.$eval(selector, (el) => {
                    const href = el.getAttribute("href");
                    const clean = href?.replace(/^\/|\/$/g, "");
                    if (
                      clean &&
                      !["p", "explore", "accounts", "direct", "reels"].includes(
                        clean
                      )
                    ) {
                      return clean;
                    }
                    return null;
                  });
                  if (username) break;
                } else {
                  username = await postPage.$eval(selector, (el) =>
                    el.textContent.trim()
                  );
                  if (username) break;
                }
              } catch (e) {
                continue;
              }
            }

            username = username.replace(/[^a-zA-Z0-9._]/g, "") || "unknown";

            // หา caption
            let caption = "ไม่มี caption";
            const captionSelectors = [
              'span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx.x126k92a[style*="line-height: 18px"]',
              'span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2[style*="line-height: 18px"]',
              "span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2",
              "span.x193iq5w.xeuugli.x13faqbe.x1vvkbs",
              'span[style*="line-height: 18px"]',
              'article span[dir="auto"]',
              'div[role="main"] span[dir="auto"]',
              'span:not([class*="icon"]):not([class*="button"])',
            ];

            for (const selector of captionSelectors) {
              try {
                caption = await postPage.$eval(selector, (el) => {
                  const tempDiv = document.createElement("div");
                  tempDiv.innerHTML = el.innerHTML;
                  const hashtagLinks = tempDiv.querySelectorAll(
                    'a[href*="/explore/tags/"]'
                  );
                  hashtagLinks.forEach((link) => {
                    const span = document.createElement("span");
                    span.textContent = link.textContent;
                    link.replaceWith(span);
                  });
                  let text = tempDiv.textContent || tempDiv.innerText || "";
                  text = text
                    .replace(/\s+/g, " ")
                    .replace(/^\.\s*/, "")
                    .replace(/\s*\.\s*$/, "")
                    .replace(/\n/g, " ")
                    .trim();
                  if (text.length > 200) text = text.substring(0, 200) + "...";
                  return text;
                });

                if (
                  caption &&
                  caption.trim() &&
                  caption !== "." &&
                  caption !== "ไม่มี caption"
                )
                  break;
              } catch (e) {
                continue;
              }
            }

            if (!caption || caption === "ไม่มี caption") {
              try {
                caption = await postPage.evaluate(() => {
                  const spans = document.querySelectorAll("span");
                  for (let span of spans) {
                    const text = span.textContent?.trim();
                    if (
                      text &&
                      text.length > 3 &&
                      !text.includes("http") &&
                      !text.includes("@")
                    ) {
                      return text;
                    }
                  }
                  return "ไม่มี caption";
                });
              } catch (e) {}
            }

            const sentimentResult = await analyzeSentiment(caption);
            await postPage.close();

            if (sentimentResult === "ความคิดเห็นเชิงลบ") {
              allResults.push({
                username,
                caption,
                postUrl,
                analyzeSentiment: sentimentResult,
              });
              console.log(
                `เก็บโพสต์ Instagram เชิงลบได้ ${allResults.length}/${limit}`
              );
            }
          } catch (err) {
            console.log(`โหลดโพสต์ล้มเหลว: ${postUrl}`, err.message);
          }
        }
      }
      const lastHeight = await page.evaluate("document.body.scrollHeight");
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(5000);

      const newHeight = await page.evaluate("document.body.scrollHeight");
      if (newHeight === lastHeight) {
        console.log("หมดเนื้อหาให้ scroll ของ Facebook แล้ว");

        break;
      }

      await page.close();
    } catch (err) {
      console.error(`เกิดข้อผิดพลาดที่ keyword ${currentKeyword}:`, err);
    }
  }

  await context.close();
  await browser.close();
  return allResults;
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const results = await searchInstagram(q, parseInt(limit));
    res.json({ keyword: q, total: results.length, results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}

module.exports = {
  searchInstagram,
  handleSearch,
};
