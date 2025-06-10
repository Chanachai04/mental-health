const fs = require("fs");
const {chromium} = require("playwright");
const STORAGE_STATE_PATH = "./sessions/storageStateInstagram.json";

let cachedStorageState = null;

async function loginAndCacheSession(browser) {
    console.log("เปิด browser เพื่อ login Instagram...");
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.instagram.com/accounts/login/");
    console.log("กรุณาล็อกอินใน browser นี้...");

    // รอจนกว่าจะโหลดหน้า home feed (login สำเร็จ)
    await page.waitForURL("https://www.instagram.com/", {timeout: 0});

    cachedStorageState = await context.storageState();

    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(cachedStorageState, null, 2));
    console.log("บันทึก session ลงไฟล์สำเร็จ");

    await context.close();
}

async function searchInstagram(keyword, limit = 10) {
    const browser = await chromium.launch({headless: false});

    if (!cachedStorageState && fs.existsSync(STORAGE_STATE_PATH)) {
        cachedStorageState = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, "utf-8"));
        console.log("โหลด session จากไฟล์ storageStateInstagram.json");
    }

    if (!cachedStorageState) {
        await loginAndCacheSession(browser);
    }

    const context = await browser.newContext({
        storageState: cachedStorageState,
    });
    const page = await context.newPage();

    // ไปที่หน้า search Instagram โดยใช้ URL แบบ explore/tags หรือ search query
    // Instagram ไม่มี URL search แบบ query string ตรง ๆ ต้องใช้การพิมพ์ใน search box
    await page.goto("https://www.instagram.com/explore/tags/" + encodeURIComponent(keyword.replace("#", "")) + "/");

    // รอโหลดโพสต์
    await page.waitForSelector("article a", {timeout: 10000});

    const results = [];
    let idCounter = 1;

    while (results.length < limit) {
        const posts = await page.$$("article a");

        for (const post of posts) {
            if (results.length >= limit) break;

            const postUrl = await post.getAttribute("href");
            // กดเข้าโพสต์เพื่อดึง caption
            const postPage = await context.newPage();
            await postPage.goto("https://www.instagram.com" + postUrl);

            // ดึง username
            const username = await postPage.$eval("header a", (el) => el.innerText).catch(() => "unknown");
            // ดึง caption (ถ้ามี)
            const caption = await postPage.$eval("div.C4VMK > span", (el) => el.innerText).catch(() => "unknown");

            await postPage.close();

            if (caption !== "unknown") {
                if (!results.some((r) => r.postUrl === postUrl)) {
                    results.push({id: idCounter++, username, caption, postUrl: "https://www.instagram.com" + postUrl});
                }
            }
        }

        // เลื่อนลงเพื่อโหลดโพสต์เพิ่ม
        const lastHeight = await page.evaluate("document.body.scrollHeight");
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await page.waitForTimeout(2000);
        const newHeight = await page.evaluate("document.body.scrollHeight");
        if (newHeight === lastHeight) break; // เลื่อนจนสุดแล้ว
    }

    await context.close();
    await browser.close();

    return results.slice(0, limit);
}

async function handleSearch(req, res) {
    const {q, limit} = req.query;

    if (!q) return res.status(400).json({error: "Missing ?q=keyword"});

    try {
        const numLimit = limit ? parseInt(limit) : 10;
        const results = await searchInstagram(q, numLimit);
        res.json({results});
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({error: "Search failed"});
    }
}

module.exports = {
    handleSearch,
};
