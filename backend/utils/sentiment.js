require("dotenv").config();
const fetch = require("node-fetch");

const API_URL =
  process.env.SENTIMENT_API_URL || "http://119.59.118.120:5000/sentiment";

async function analyzeSentiment(message) {
  if (!message || message.trim() === "") return "ไม่สามารถระบุได้";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const sentiment = data?.sentiment;

    // Log all available sentiment data
    // console.log("TextBlob Polarity:", sentiment.textblob?.polarity);
    // console.log("TextBlob Subjectivity:", sentiment.textblob?.subjectivity);
    // console.log("VADER Compound Score:", sentiment.vader?.compound);
    // console.log("VADER All Scores:", sentiment.vader);

    // Example decision logic
    if (sentiment.vader?.compound >= 0) {
      return "ความคิดเห็นเชิงบวก";
    } else if (sentiment.vader?.compound < 0) {
      return "ความคิดเห็นเชิงลบ";
    } else {
      return "ไม่สามารถระบุได้";
    }
  } catch (err) {
    console.error("Sentiment API error:", err.message);
    return "ไม่สามารถระบุได้";
  }
}

module.exports = { analyzeSentiment };
