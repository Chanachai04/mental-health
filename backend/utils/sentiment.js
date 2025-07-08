require("dotenv").config();
const axios = require("axios");

const API_URL =
  process.env.SENTIMENT_API_URL || "http://119.59.118.120:5000/sentiment";

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

    if (!sentiment) {
      throw new Error("ไม่มีข้อมูล sentiment กลับมา");
    }

    const compound = sentiment.vader?.compound;
    // Log all available sentiment data
    // console.log("TextBlob Polarity:", sentiment.textblob?.polarity);
    // console.log("TextBlob Subjectivity:", sentiment.textblob?.subjectivity);
    // console.log("VADER Compound Score:", sentiment.vader?.compound);
    // console.log("VADER All Scores:", sentiment.vader);

    if (compound >= 0.05) {
      return "ความคิดเห็นเชิงบวก";
    } else if (compound <= -0.05) {
      return "ความคิดเห็นเชิงลบ";
    } else {
      return "ความคิดเห็นเป็นกลาง";
    }
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
