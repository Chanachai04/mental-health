require("dotenv").config();

const twitterController = require("./controllers/twitter.controller");
const tiktokController = require("./controllers/tiktok.controller");
const mysql = require("mysql2/promise");

// สร้าง pool สำหรับ scheduler
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
});

// เก็บสถานะการค้นหา
let schedulerState = {
  isRunning: false,
  keyword: "",
  intervalHours: 0,
  searchLimit: 40,
  totalCollected: 0,
  lastSearchTime: null,
  nextSearchTime: null,
  intervalId: null,
};

// ฟังก์ชันบันทึกผลลัพธ์หลายรายการ
async function saveMultipleResults(results) {
  try {
    let savedCount = 0;
    let duplicateCount = 0;

    for (const item of results) {
      const { username, caption, platform, baseurl } = item;

      const [rows] = await pool.query(
        `SELECT 1 FROM mental_health WHERE baseurl = ? LIMIT 1`,
        [baseurl]
      );

      if (rows.length > 0) {
        duplicateCount++;
        continue;
      }

      await pool.query(
        `INSERT INTO mental_health (username, caption, platform, baseurl) VALUES (?, ?, ?, ?)`,
        [username, caption, platform, baseurl]
      );

      savedCount++;
    }

    console.log(
      `Saved: ${savedCount}, Duplicates: ${duplicateCount}, Total: ${results.length}`
    );
    return savedCount;
  } catch (error) {
    console.error("Error saving results:", error);
    return 0;
  }
}

// ฟังก์ชันค้นหาจาก platform ต่างๆ
async function performSearch() {
  if (!schedulerState.keyword) {
    console.log("No keyword set, skipping search");
    return;
  }

  console.log(`\n=== Starting scheduled search ===`);
  console.log(`Keyword: ${schedulerState.keyword}`);
  console.log(`Limit: ${schedulerState.searchLimit}`);
  console.log(`Time: ${new Date().toLocaleString()}`);

  const platforms = ["twitter", "tiktok"];
  let newlyFoundResults = [];

  try {
    for (const platform of platforms) {
      try {
        console.log(`\nSearching ${platform}...`);

        let results = [];
        
        // สร้าง mock req/res
        const mockReq = {
          query: {
            q: schedulerState.keyword,
            limit: schedulerState.searchLimit,
          },
        };
        
        const mockRes = {
          json: (data) => {
            results = data.results || [];
          },
          status: () => mockRes,
        };

        if (platform === "twitter") {
          await twitterController.handleSearch(mockReq, mockRes);
        } else if (platform === "tiktok") {
          await tiktokController.handleSearch(mockReq, mockRes);
        }

        const formattedResults = results.map((r) => ({
          username: r.username || "anonymous",
          caption: r.caption || "",
          platform,
          baseurl: r.postUrl || r.videoUrl || "",
        }));

        console.log(`${platform} found: ${formattedResults.length} posts`);
        newlyFoundResults.push(...formattedResults);
      } catch (error) {
        console.error(`Error searching ${platform}:`, error.message);
      }
    }

    if (newlyFoundResults.length > 0) {
      const savedCount = await saveMultipleResults(newlyFoundResults);
      schedulerState.totalCollected += savedCount;
      console.log(
        `\nSearch completed: ${newlyFoundResults.length} found, ${savedCount} saved`
      );
      console.log(`Total collected this session: ${schedulerState.totalCollected}`);
    } else {
      console.log("\nNo new posts found in this search");
    }

    schedulerState.lastSearchTime = new Date();
    schedulerState.nextSearchTime = new Date(
      Date.now() + schedulerState.intervalHours * 60 * 60 * 1000
    );

    // เพิ่ม limit ทีละ 10 (max 60)
    schedulerState.searchLimit = Math.min(schedulerState.searchLimit + 10, 60);
  } catch (error) {
    console.error("Search error:", error);
  }
}

// เริ่มการค้นหาอัตโนมัติ
function startScheduler(keyword, intervalHours) {
  if (schedulerState.isRunning) {
    console.log("Scheduler already running, stopping old one first");
    stopScheduler();
  }

  schedulerState.isRunning = true;
  schedulerState.keyword = keyword;
  schedulerState.intervalHours = intervalHours;
  schedulerState.searchLimit = 40; // reset limit
  schedulerState.totalCollected = 0;
  schedulerState.lastSearchTime = null;
  schedulerState.nextSearchTime = new Date(
    Date.now() + intervalHours * 60 * 60 * 1000
  );

  console.log(`\n=== Scheduler Started ===`);
  console.log(`Keyword: ${keyword}`);
  console.log(`Interval: ${intervalHours} hours`);
  console.log(`Next search: ${schedulerState.nextSearchTime.toLocaleString()}`);

  // ค้นหาทันทีครั้งแรก
  performSearch();

  // ตั้ง interval สำหรับค้นหาครั้งต่อไป
  const intervalMs = intervalHours * 60 * 60 * 1000;
  schedulerState.intervalId = setInterval(() => {
    if (schedulerState.isRunning) {
      performSearch();
    }
  }, intervalMs);
}

// หยุดการค้นหาอัตโนมัติ
function stopScheduler() {
  if (schedulerState.intervalId) {
    clearInterval(schedulerState.intervalId);
    schedulerState.intervalId = null;
  }

  console.log(`\n=== Scheduler Stopped ===`);
  console.log(`Total collected: ${schedulerState.totalCollected}`);

  schedulerState.isRunning = false;
  schedulerState.keyword = "";
  schedulerState.intervalHours = 0;
  schedulerState.lastSearchTime = null;
  schedulerState.nextSearchTime = null;
}

// ดูสถานะปัจจุบัน
function getSchedulerStatus() {
  return {
    isRunning: schedulerState.isRunning,
    keyword: schedulerState.keyword,
    intervalHours: schedulerState.intervalHours,
    searchLimit: schedulerState.searchLimit,
    totalCollected: schedulerState.totalCollected,
    lastSearchTime: schedulerState.lastSearchTime,
    nextSearchTime: schedulerState.nextSearchTime,
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
};
