const fs = require("fs");
const path = require("path"); // Import path module
const { chromium } = require("playwright");

// กำหนดพาธสำหรับเก็บสถานะของ session ของ TikTok
const STORAGE_STATE_PATH = path.join(
  __dirname,
  "sessions",
  "storageStateTikTok.json"
);

let cachedStorageState = null;

/**
 * ฟังก์ชันสำหรับเข้าสู่ระบบ TikTok และบันทึก session
 * หาก session ยังไม่มีหรือหมดอายุ จะเปิดเบราว์เซอร์ให้ผู้ใช้เข้าสู่ระบบด้วยตนเอง
 * @param {import('playwright').Browser} browser อินสแตนซ์ของเบราว์เซอร์
 */
async function loginAndCacheSession(browser) {
  console.log("เปิด browser เพื่อ login TikTok...");
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ไปยังหน้าเข้าสู่ระบบของ TikTok
    await page.goto("https://www.tiktok.com/login", {
      waitUntil: "load",
      timeout: 60000,
    }); // เพิ่ม timeout สำหรับการโหลดหน้าแรก

    console.log(
      "กรุณาล็อกอินด้วยบัญชี TikTok ของคุณในเบราว์เซอร์ที่เปิดขึ้นมา"
    );
    console.log(
      "สำคัญ: อย่าปิดเบราว์เซอร์นี้ด้วยตนเองจนกว่าข้อความ 'บันทึก session ลงไฟล์เรียบร้อยแล้ว' จะปรากฏขึ้นในคอนโซล"
    );

    // รอนานสูงสุด 5 นาที (300000 ms) เพื่อให้ผู้ใช้ล็อกอินและ Playwright ตรวจพบว่าล็อกอินสำเร็จ
    // เราจะใช้ Promise.race เพื่อรอเงื่อนไขใดเงื่อนไขหนึ่งที่บ่งชี้ว่าล็อกอินสำเร็จ
    // เงื่อนไขเหล่านี้อาจเป็น:
    // 1. URL เปลี่ยนไปที่หน้าหลักของ TikTok (https://www.tiktok.com/)
    // 2. มีการปรากฏขององค์ประกอบที่ระบุว่าผู้ใช้ได้เข้าสู่ระบบและอยู่ในหน้าฟีดแล้ว
    //    (เช่น 'For You' section, หรือ video description ของโพสต์ในฟีด)
    await Promise.race([
      page.waitForURL("https://www.tiktok.com/", { timeout: 300000 }), // รอ URL หลักนาน 5 นาที
      page.waitForSelector('div[data-e2e="feed-for-you"]', { timeout: 300000 }), // หรือรอ div "For You"
      page.waitForSelector('div[data-e2e="video-desc"]', { timeout: 300000 }), // หรือรอคำบรรยายวิดีโอแรกในฟีด
    ]);

    console.log("ตรวจพบว่าเข้าสู่ระบบสำเร็จ...");

    cachedStorageState = await context.storageState();
    fs.writeFileSync(
      STORAGE_STATE_PATH,
      JSON.stringify(cachedStorageState, null, 2)
    );
    console.log("บันทึก session ลงไฟล์เรียบร้อยแล้ว");
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบ TikTok:");
    console.error("สาเหตุ:", error.message);
    console.error(
      "โปรดตรวจสอบว่าคุณได้เข้าสู่ระบบสำเร็จแล้ว และไม่ได้ปิดเบราว์เซอร์ Playwright ด้วยตนเอง"
    );
    // ถ่ายภาพหน้าจอเพื่อช่วยในการดีบักหากเกิดข้อผิดพลาด
    await page.screenshot({ path: "tiktok-login-failure.png", fullPage: true });
    throw error; // ส่ง error ต่อไปเพื่อแจ้งว่าการเข้าสู่ระบบล้มเหลว
  } finally {
    // ตรวจสอบให้แน่ใจว่า context ถูกปิดเสมอ ไม่ว่าจะสำเร็จหรือล้มเหลว
    // ลบ !context.isClosed() เพราะ BrowserContext ไม่มีเมธอดนี้
    if (context) {
      await context.close();
    }
  }
}

/**
 * ฟังก์ชันสำหรับค้นหาวิดีโอใน TikTok โดยใช้คีย์เวิร์ด
 * @param {string} keyword คีย์เวิร์ดที่ต้องการค้นหา (เช่น "แมว", "เทคโนโลยี")
 * @param {number} limit จำนวนวิดีโอสูงสุดที่ต้องการดึงข้อมูล
 * @returns {Promise<Array<Object>>} อาร์เรย์ของออบเจกต์ที่แต่ละออบเจกต์แทนข้อมูลวิดีโอ
 */
async function searchTikTok(keyword, limit = 10) {
  // เปิดเบราว์เซอร์ในโหมดไม่ Headless (แสดง UI) และหน่วงเวลาเล็กน้อยเพื่อเลียนแบบการทำงานของมนุษย์
  const browser = await chromium.launch({ headless: false, slowMo: 100 });

  // ตรวจสอบว่ามี session ที่บันทึกไว้หรือไม่ และโหลดหากมี
  if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
    cachedStorageState = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, "utf-8")
    );
    console.log("โหลด session จากไฟล์ storageStateTikTok.json");
  }

  // หากยังไม่มี session ที่โหลดได้ ให้เข้าสู่ระบบและบันทึก session ใหม่
  if (!cachedStorageState) {
    await loginAndCacheSession(browser);
  }

  // สร้าง context ใหม่โดยใช้ session ที่บันทึกไว้
  const context = await browser.newContext({
    storageState: cachedStorageState,
  });
  const page = await context.newPage();

  // สร้าง URL สำหรับการค้นหา hashtag ใน TikTok
  const searchUrl = `https://www.tiktok.com/tag/${encodeURIComponent(
    keyword.replace("#", "")
  )}`;
  await page.goto(searchUrl, { waitUntil: "load" });

  // เลื่อนหน้าจอลงเพื่อโหลดวิดีโอเพิ่มเติม (TikTok โหลดวิดีโอแบบ Infinite Scroll)
  for (let i = 0; i < 5; i++) {
    // เพิ่มจำนวนครั้งในการเลื่อนเพื่อดึงข้อมูลมากขึ้น
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000); // รอให้เนื้อหาโหลดหลังจากเลื่อน
  }

  // Selector สำหรับลิงก์ไปยังการ์ดวิดีโอแต่ละรายการบนหน้าผลการค้นหา
  const videoCardSelector = 'div[data-e2e="search-video-card"] a';

  try {
    // รอให้ selector ของการ์ดวิดีโอปรากฏขึ้นมา
    await page.waitForSelector(videoCardSelector, { timeout: 30000 }); // เพิ่ม timeout
  } catch (err) {
    // หากไม่พบ selector ให้จับภาพหน้าจอเพื่อการดีบัก
    await page.screenshot({ path: "tiktok-debug.png", fullPage: true });
    throw new Error("ไม่สามารถหาโพสต์วิดีโอบนหน้า TikTok ได้");
  }

  // ดึง Element ทั้งหมดที่ตรงกับ selector ของการ์ดวิดีโอ
  const videoElements = await page.$$(videoCardSelector);
  console.log(`เจอวิดีโอทั้งหมด: ${videoElements.length}`);

  const videoTasks = [];

  // วนลูปผ่าน Element ของวิดีโอที่พบ (จำกัดด้วย 'limit')
  for (const video of videoElements.slice(0, limit)) {
    const videoPath = await video.getAttribute("href");
    if (!videoPath) continue;

    const videoUrl = videoPath; // ลิงก์ของ TikTok มักจะเป็น URL เต็มแล้ว

    // สร้าง Promise สำหรับการดึงข้อมูลของแต่ละวิดีโอ
    const task = (async () => {
      let videoPage;
      try {
        videoPage = await context.newPage();
        // ไปยัง URL ของวิดีโอแต่ละรายการ
        await videoPage.goto(videoUrl, { waitUntil: "load", timeout: 45000 }); // เพิ่ม timeout

        // รอให้หน้าวิดีโอโหลดข้อมูลต่างๆ อย่างสมบูรณ์
        await videoPage.waitForTimeout(3000);

        let username = "unknown";
        try {
          // ลองใช้ selectors หลายตัวเพื่อหาชื่อผู้ใช้ (TikTok อาจมีการเปลี่ยนแปลง selector)
          username = await videoPage.$eval(
            'a[data-e2e="video-page-follower-username"]',
            (el) => el.innerText
          );
        } catch (error) {
          try {
            username = await videoPage.$eval(
              'h1[data-e2e="browse-username"]',
              (el) => el.innerText
            );
          } catch (error) {
            console.log(`ไม่สามารถหา username ได้สำหรับ ${videoUrl}`);
          }
        }

        let caption = "ไม่มี caption";
        try {
          // ลองใช้ selectors หลายตัวเพื่อหาคำบรรยายวิดีโอ
          caption = await videoPage.$eval(
            'h1[data-e2e="challenge-item-desc"]',
            (el) => el.innerText
          );
        } catch (error) {
          try {
            caption = await videoPage.$eval(
              'div[data-e2e="video-desc"]',
              (el) => el.innerText
            );
          } catch (error) {
            console.log(`ไม่สามารถหา caption ได้สำหรับ ${videoUrl}`);
          }
        }

        let likes = "N/A";
        try {
          // ดึงจำนวนไลก์
          likes = await videoPage.$eval(
            'strong[data-e2e="like-count"]',
            (el) => el.innerText
          );
        } catch (error) {
          console.log(`ไม่สามารถหาจำนวนไลก์ได้สำหรับ ${videoUrl}`);
        }

        let comments = "N/A";
        try {
          // ดึงจำนวนคอมเมนต์
          comments = await videoPage.$eval(
            'strong[data-e2e="comment-count"]',
            (el) => el.innerText
          );
        } catch (error) {
          console.log(`ไม่สามารถหาจำนวนคอมเมนต์ได้สำหรับ ${videoUrl}`);
        }

        let shares = "N/A";
        try {
          // ดึงจำนวนแชร์
          shares = await videoPage.$eval(
            'strong[data-e2e="share-count"]',
            (el) => el.innerText
          );
        } catch (error) {
          console.log(`ไม่สามารถหาจำนวนแชร์ได้สำหรับ ${videoUrl}`);
        }

        // ทำความสะอาดคำบรรยาย (ลบ hashtag และจำกัดความยาว)
        if (caption && caption !== "ไม่มี caption") {
          // ลบ hashtag ที่อยู่ท้ายข้อความ
          caption = caption.replace(/\s*#[\w\u0E00-\u0E7F]+/g, "").trim();
          // จำกัดความยาวของ caption
          if (caption.length > 200) {
            caption = caption.substring(0, 200) + "...";
          }
        }

        console.log(
          `✓ ดึงข้อมูลสำเร็จ: ${username} - ${caption.substring(
            0,
            Math.min(caption.length, 50)
          )}...`
        );

        return {
          username: username || "unknown",
          caption: caption || "ไม่มี caption",
          likes,
          comments,
          shares,
          videoUrl,
        };
      } catch (err) {
        console.log(`โหลดวิดีโอจาก ${videoUrl} ล้มเหลว:`);
        console.log("สาเหตุ:", err.message);
        return null;
      } finally {
        // ปิดหน้าวิดีโอหลังจากดึงข้อมูลเสร็จสิ้น
        if (videoPage && !videoPage.isClosed()) {
          await videoPage.close();
        }
      }
    })();

    videoTasks.push(task);
    // เพิ่มการหน่วงเวลาเล็กน้อยระหว่างการดึงข้อมูลวิดีโอแต่ละรายการ
    // เพื่อป้องกันการถูกบล็อกจากการร้องขอที่มากเกินไป
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("กำลังดึงข้อมูลจากวิดีโอทั้งหมด...");
  // รอให้การดึงข้อมูลวิดีโอทุกรายการเสร็จสิ้น
  const videoResults = await Promise.allSettled(videoTasks);
  const results = [];
  let idCounter = 1;

  // กรองเฉพาะผลลัพธ์ที่สำเร็จ
  for (const r of videoResults) {
    if (r.status === "fulfilled" && r.value) {
      results.push({ id: idCounter++, ...r.value });
    }
  }

  // ปิด context และเบราว์เซอร์
  // ลบ !context.isClosed() เพราะ BrowserContext ไม่มีเมธอดนี้
  if (context) {
    await context.close();
  }
  await browser.close();

  console.log(`\n=== ผลลัพธ์การค้นหา "${keyword}" บน TikTok ===`);
  // แสดงผลลัพธ์ที่ดึงมาได้
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Username: ${result.username}`);
    console.log(`   Caption: ${result.caption}`);
    console.log(`   Likes: ${result.likes}`);
    console.log(`   Comments: ${result.comments}`);
    console.log(`   Shares: ${result.shares}`);
    console.log(`   URL: ${result.videoUrl}`);
  });

  return results.slice(0, limit);
}

/**
 * Middleware สำหรับจัดการคำขอค้นหา
 * @param {Object} req ออบเจกต์คำขอ HTTP
 * @param {Object} res ออบเจกต์การตอบกลับ HTTP
 */
async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q=keyword" });
  }

  try {
    const numLimit = limit ? parseInt(limit) : 10;
    console.log(`เริ่มค้นหา "${q}" จำนวน ${numLimit} วิดีโอ บน TikTok`);
    const results = await searchTikTok(q, numLimit);

    // ส่งผลลัพธ์กลับในรูปแบบ JSON
    res.json({
      keyword: q,
      total: results.length,
      results: results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
}

module.exports = {
  handleSearch,
};
