const fs = require("fs");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateTiktok.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login TikTok...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.tiktok.com/login");
  console.log("กรุณาล็อกอินใน browser ที่เปิดขึ้นมา...");

  // รอให้ redirect ไปหน้าหลักหลังจาก login สำเร็จ
  await page.waitForURL("https://www.tiktok.com/", { timeout: 0 });

  cachedStorageState = await context.storageState();
  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(cachedStorageState, null, 2)
  );
  console.log("บันทึก session ลงไฟล์เรียบร้อยแล้ว");

  await context.close();
}

async function searchTiktok(keyword, limit = 10) {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateTiktok.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  // ค้นหาผ่าน hashtag หรือ keyword
  const searchUrl = `https://www.tiktok.com/tag/${encodeURIComponent(
    keyword.replace("#", "")
  )}`;
  await page.goto(searchUrl, { waitUntil: "load" });

  // เพิ่ม scroll เพื่อโหลดวิดีโอเพิ่มเติม
  for (let i = 0; i < 5; i++) {
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(3000);
  }

  // selector สำหรับวิดีโอ TikTok
  const videoSelector = 'div[data-e2e="challenge-item"] a, a[href*="/video/"]';

  try {
    await page.waitForSelector(videoSelector, { timeout: 20000 });
  } catch (err) {
    await page.screenshot({ path: "tiktok-debug.png", fullPage: true });
    throw new Error("ไม่สามารถหาวิดีโอบนหน้า TikTok ได้");
  }

  const videoElements = await page.$$(videoSelector);
  console.log(`เจอวิดีโอทั้งหมด: ${videoElements.length}`);

  const videoTasks = [];

  for (const video of videoElements.slice(0, limit)) {
    const videoUrl = await video.getAttribute("href");
    if (!videoUrl || !videoUrl.includes("/video/")) continue;

    const fullVideoUrl = videoUrl.startsWith("http")
      ? videoUrl
      : "https://www.tiktok.com" + videoUrl;

    const task = (async () => {
      let videoPage;
      try {
        videoPage = await context.newPage();
        await videoPage.goto(fullVideoUrl, {
          waitUntil: "load",
          timeout: 30000,
        });

        // รอให้หน้าโหลดเสร็จ
        await videoPage.waitForTimeout(3000);

        // ลองหา username จาก selector หลายแบบ
        let username = "unknown";
        try {
          // ลองหา username จาก data-e2e="browse-username"
          username = await videoPage.$eval(
            '[data-e2e="browse-username"]',
            (el) => el.innerText
          );
        } catch {
          try {
            // ลองหา username จาก span ที่มี unique-id
            username = await videoPage.$eval(
              'span[data-e2e="browse-username"]',
              (el) => el.innerText
            );
          } catch {
            try {
              // ลองหา username จาก h2 ที่มี data-e2e
              username = await videoPage.$eval(
                'h2[data-e2e="browse-username"] span',
                (el) => el.innerText
              );
            } catch {
              try {
                // ลองหา username จาก URL pattern
                const urlMatch = fullVideoUrl.match(/@([^/]+)/);
                if (urlMatch) {
                  username = urlMatch[1];
                }
              } catch {
                console.log(`ไม่สามารถหา username ได้สำหรับ ${fullVideoUrl}`);
              }
            }
          }
        }

        // ลองหา caption/description จาก selector หลายแบบ
        let caption = "unknown";
        try {
          // ลองหา caption จาก data-e2e="browse-video-desc"
          caption = await videoPage.$eval(
            '[data-e2e="browse-video-desc"]',
            (el) => el.innerText
          );
        } catch {
          try {
            // ลองหา caption จาก div ที่มี title attribute
            caption = await videoPage.$eval("div[title]", (el) =>
              el.getAttribute("title")
            );
          } catch {
            try {
              // ลองหา caption จาก meta description
              caption = await videoPage.$eval(
                'meta[name="description"]',
                (el) => el.getAttribute("content")
              );
              // ตัดข้อมูลส่วนเกินออกจาก caption
              if (caption && caption.includes(" on TikTok")) {
                caption = caption.split(" on TikTok")[0];
              }
            } catch {
              try {
                // ลองหา caption จาก h1
                caption = await videoPage.$eval("h1", (el) => el.innerText);
              } catch {
                console.log(`ไม่สามารถหา caption ได้สำหรับ ${fullVideoUrl}`);
              }
            }
          }
        }

        // ลองหา likes count
        let likes = "0";
        try {
          likes = await videoPage.$eval(
            '[data-e2e="like-count"]',
            (el) => el.innerText
          );
        } catch {
          try {
            likes = await videoPage.$eval(
              '[data-e2e="browse-like-count"]',
              (el) => el.innerText
            );
          } catch {
            console.log(`ไม่สามารถหา likes count ได้สำหรับ ${fullVideoUrl}`);
          }
        }

        // ลองหา comments count
        let comments = "0";
        try {
          comments = await videoPage.$eval(
            '[data-e2e="comment-count"]',
            (el) => el.innerText
          );
        } catch {
          try {
            comments = await videoPage.$eval(
              '[data-e2e="browse-comment-count"]',
              (el) => el.innerText
            );
          } catch {
            console.log(`ไม่สามารถหา comments count ได้สำหรับ ${fullVideoUrl}`);
          }
        }

        // ลองหา shares count
        let shares = "0";
        try {
          shares = await videoPage.$eval(
            '[data-e2e="share-count"]',
            (el) => el.innerText
          );
        } catch {
          try {
            shares = await videoPage.$eval(
              '[data-e2e="browse-share-count"]',
              (el) => el.innerText
            );
          } catch {
            console.log(`ไม่สามารถหา shares count ได้สำหรับ ${fullVideoUrl}`);
          }
        }

        // ล้างข้อมูลที่ไม่ต้องการ
        if (caption && caption !== "unknown") {
          // ตัด hashtag ออกจากท้ายข้อความ (เก็บไว้บางส่วน)
          const hashtagPattern = /\s*(#[\w\u0E00-\u0E7F]+\s*){3,}/g;
          caption = caption.replace(hashtagPattern, " #...");

          // จำกัดความยาว caption
          if (caption.length > 200) {
            caption = caption.substring(0, 200) + "...";
          }
        }

        // ล้าง username
        if (username && username.startsWith("@")) {
          username = username.substring(1);
        }

        console.log(
          `✓ ดึงข้อมูลสำเร็จ: @${username} - ${caption.substring(
            0,
            50
          )}... (❤️${likes})`
        );

        return {
          username: username || "unknown",
          caption: caption || "ไม่มี caption",
          likes: likes || "0",
          comments: comments || "0",
          shares: shares || "0",
          videoUrl: fullVideoUrl,
        };
      } catch (err) {
        console.log(`โหลดวิดีโอล้มเหลว: ${fullVideoUrl}`);
        console.log("สาเหตุ:", err.message);
        return null;
      } finally {
        if (videoPage && !videoPage.isClosed()) {
          await videoPage.close();
        }
      }
    })();

    videoTasks.push(task);
  }

  console.log("กำลังดึงข้อมูលจากวิดีโอทั้งหมด...");
  const videoResults = await Promise.allSettled(videoTasks);
  const results = [];
  let idCounter = 1;

  for (const r of videoResults) {
    if (r.status === "fulfilled" && r.value) {
      results.push({ id: idCounter++, ...r.value });
    }
  }

  await context.close();
  await browser.close();

  console.log(`\n=== ผลลัพธ์การค้นหา TikTok "${keyword}" ===`);
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Username: @${result.username}`);
    console.log(`   Caption: ${result.caption}`);
    console.log(
      `   Likes: ${result.likes} | Comments: ${result.comments} | Shares: ${result.shares}`
    );
    console.log(`   URL: ${result.videoUrl}`);
  });

  return results.slice(0, limit);
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) return res.status(400).json({ error: "Missing ?q=keyword" });

  try {
    const numLimit = limit ? parseInt(limit) : 10;
    console.log(`เริ่มค้นหา TikTok "${q}" จำนวน ${numLimit} วิดีโอ`);
    const results = await searchTiktok(q, numLimit);

    // แสดงผลลัพธ์ใน response
    res.json({
      platform: "TikTok",
      keyword: q,
      total: results.length,
      results: results,
    });
  } catch (err) {
    console.error("TikTok Search error:", err);
    res.status(500).json({ error: err.message || "TikTok search failed" });
  }
}

module.exports = {
  handleSearch,
};
