require("dotenv").config();
const axios = require("axios");

const API_URL =
  process.env.SENTIMENT_API_URL ;

async function analyzeSentiment(message) {
  if (!message || message.trim() === "") return "ไม่สามารถระบุได้";

  try {
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
