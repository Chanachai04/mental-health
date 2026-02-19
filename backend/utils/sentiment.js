const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const axios = require("axios");

// โหลด .env.local ถ้ามี (dotenv ปกติจะอ่านแค่ .env)
const envLocalPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

function normalizeApiUrl(raw) {
  const value = (raw ?? "").toString().trim().replace(/^["']|["']$/g, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  // รองรับกรณีใส่แค่ host:port/path โดยลืม http://
  if (/^[\w.-]+:\d{2,5}(\/.*)?$/.test(value)) return `http://${value}`;
  return value;
}

const API_URL = normalizeApiUrl(process.env.SENTIMENT_API_URL);

async function analyzeSentiment(message) {
  if (!message || message.trim() === "") return "ไม่สามารถระบุได้";

  try {
    if (!API_URL) {
      throw new Error(
        'Missing SENTIMENT_API_URL. Please set it in .env or .env.local (e.g. SENTIMENT_API_URL="http://127.0.0.1:5000/sentiment")'
      );
    }
    const response = await axios.post(
      API_URL,
      { text: message },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000, // 10 วินาที
      }
    );

    const sentiment = response.data?.sentiment;
    const confidence = response.data?.confidence;

    if (!sentiment) {
      throw new Error("ไม่มีข้อมูล sentiment กลับมา");
    }

    // แปลง label เป็นข้อความไทย (ถ้าต้องการ)
    const labelMap = {
      positive: "ความคิดเห็นเชิงบวก",
      negative: "ความคิดเห็นเชิงลบ",
      unknown: "ความคิดเห็นเป็นกลาง",
    };

    return `${labelMap[sentiment] || "ความคิดเห็นไม่แน่ชัด"}`;
  } catch (err) {
    if (err.code === "ECONNABORTED") {
      console.error("เชื่อมต่อ API ไม่ทันเวลา (timeout)");
    } else if (err.response) {
      console.error(
        `API ส่งกลับ error: ${err.response.status} - ${err.response.statusText}`
      );
    } else {
      console.error("Sentiment API error:", err.message);
    }

    return "ไม่สามารถวิเคราะห์ข้อความได้";
  }
}

module.exports = { analyzeSentiment };
