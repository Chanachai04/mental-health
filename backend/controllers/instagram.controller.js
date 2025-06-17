const fs = require("fs");
const { chromium } = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateInstagram.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login Instagram...");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/");
  console.log("กรุณาล็อกอินใน browser ที่เปิดขึ้นมา...");

  await page.waitForURL("https://www.instagram.com/", { timeout: 0 });
  const storage = await context.storageState();
  fs.mkdirSync("./sessions", { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storage, null, 2));
  console.log("บันทึก session ลงไฟล์สำเร็จ");
  await context.close();
}

async function searchInstagram(keyword, limit = 10) {
  const browser = await chromium.launch({
    headless: process.env.NODE_ENV === "production",
    slowMo: 100,
  });

  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateInstagram.json");
  }

  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(
    keyword.replace("#", "")
  )}/`;
  await page.goto(searchUrl, { waitUntil: "load" });

  // เพิ่ม scroll เพื่อโหลดโพสต์เพิ่มเติม
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

        // รอให้หน้าโหลดเสร็จ
        await postPage.waitForTimeout(2000);

        // ลองหา username จาก selector หลายแบบ
        let username = "unknown";
        try {
          // ลองหา username จาก selector แรก
          username = await postPage.$eval("header a", (el) => el.innerText);
        } catch {
          try {
            // ลองหา username จาก selector สำรอง
            username = await postPage.$eval(
              "article header a",
              (el) => el.innerText
            );
          } catch {
            try {
              // ลองหา username จาก span ที่มี dir="auto"
              username = await postPage.$eval(
                'span[dir="auto"]',
                (el) => el.innerText
              );
            } catch {
              console.log(`ไม่สามารถหา username ได้สำหรับ ${postUrl}`);
            }
          }
        }

        // ลองหา caption จาก selector หลายแบบ
        let caption = "unknown";
        try {
          // ลองหา caption จาก selector แรก
          caption = await postPage.$eval(
            "div.C4VMK > span",
            (el) => el.innerText
          );
        } catch {
          try {
            // ลองหา caption จาก meta description
            caption = await postPage.$eval('meta[name="description"]', (el) =>
              el.getAttribute("content")
            );
            // ตัด username และข้อมูลส่วนเกินออกจาก caption
            if (caption && caption.includes(" on Instagram: ")) {
              caption = caption.split(" on Instagram: ")[1];
              // ตัดส่วน quote marks ออก
              if (caption.includes('"')) {
                caption = caption.split('"')[1];
                // ตัดส่วนท้ายที่เป็น quote mark ออก
                if (caption.lastIndexOf('"') > 0) {
                  caption = caption.substring(0, caption.lastIndexOf('"'));
                }
              }
            }
            // ตัดส่วน likes, comments และ username ที่อยู่หน้า caption ออก
            if (caption) {
              // ตัดรูปแบบ "1,052 likes, 264 comments - username on date: "
              const likesCommentsPattern =
                /^\d+[,\d]*\s+likes?,\s+\d+[,\d]*\s+comments?\s+-\s+[\w\.]+\s+on\s+[^:]+:\s*/i;
              caption = caption.replace(likesCommentsPattern, "");

              // ตัดรูปแบบ "username on date: " ที่อาจเหลืออยู่
              const userDatePattern = /^[\w\.]+\s+on\s+[^:]+:\s*/i;
              caption = caption.replace(userDatePattern, "");
            }
          } catch {
            try {
              // ลองหา caption จาก span ใน article
              const captionElements = await postPage.$$("article span");
              for (const el of captionElements) {
                const text = await el.innerText();
                if (
                  text &&
                  text.length > 10 &&
                  !text.includes("View all") &&
                  !text.includes("comments")
                ) {
                  caption = text;
                  break;
                }
              }
            } catch {
              try {
                // ลองหา caption จาก h1
                caption = await postPage.$eval(
                  "article h1",
                  (el) => el.innerText
                );
              } catch {
                console.log(`ไม่สามารถหา caption ได้สำหรับ ${postUrl}`);
              }
            }
          }
        }

        // ล้างข้อมูลที่ไม่ต้องการ
        if (caption && caption !== "unknown") {
          // ตัด likes, comments, username และ date ออกจากหน้า caption
          const likesCommentsPattern =
            /^\d+[,\d]*\s+likes?,\s+\d+[,\d]*\s+comments?\s+-\s+[\w\.]+\s+on\s+[^:]+:\s*/i;
          caption = caption.replace(likesCommentsPattern, "");

          // ตัดรูปแบบ "username on date: " ที่อาจเหลืออยู่
          const userDatePattern = /^[\w\.]+\s+on\s+[^:]+:\s*/i;
          caption = caption.replace(userDatePattern, "");

          // ตัด quote marks ที่อาจเหลืออยู่
          caption = caption.replace(/^"|"$/g, "");

          // ตัด hashtag ออกจากท้ายข้อความ
          caption = caption.replace(/\s*#[\w\u0E00-\u0E7F]+/g, "").trim();

          // จำกัดความยาว caption
          if (caption.length > 200) {
            caption = caption.substring(0, 200) + "...";
          }
        }

        console.log(
          `✓ ดึงข้อมูลสำเร็จ: ${username} - ${caption.substring(0, 50)}...`
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

  console.log("กำลังดึงข้อมูลจากโพสต์ทั้งหมด...");
  const postResults = await Promise.allSettled(postTasks);
  const results = [];
  let idCounter = 1;

  for (const r of postResults) {
    if (r.status === "fulfilled" && r.value) {
      results.push({ id: idCounter++, ...r.value });
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
    const numLimit = limit ? parseInt(limit) : 10;
    const results = await searchInstagram(q, numLimit);

    // แสดงผลลัพธ์ใน response
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
