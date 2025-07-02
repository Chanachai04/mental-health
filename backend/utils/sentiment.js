require("dotenv").config();
const fetch = require("node-fetch");

const LM_STUDIO_URL = process.env.LM_STUDIO_URL;

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
    const result = data.choices?.[0]?.message?.content?.trim();

    if (["ความคิดเห็นเชิงบวก", "ความคิดเห็นเชิงลบ"].includes(result)) {
      return result;
    } else {
      return "ไม่สามารถระบุได้";
    }
  } catch (err) {
    console.error("Sentiment API error:", err.message);
    return "ไม่สามารถระบุได้";
  }
}

module.exports = { analyzeSentiment };
